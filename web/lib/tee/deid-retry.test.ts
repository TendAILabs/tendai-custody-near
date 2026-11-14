import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DEID_NOT_JSON } from "../deid/pipeline.ts";
import { memoryStore, dayUsage } from "../guard/visitor.ts";
import { newVisitorSession, writeVisitorCookie } from "../session/visitor.ts";
import { SUMMARY_MODEL } from "./completion.ts";
import { handleTeeDeid } from "./deid-handler.ts";
import { liveDeidClient, type LiveTransport } from "./live.ts";
import { readLedger, renderLedger, type ModelPrice, type SpendCall } from "./spend.ts";

const SECRET = "test-session-secret";
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const CLEAN = "The patient has chest tightness.";
const CANARY = "canary-malformed-9f3a";
const CHEAP: ModelPrice = { model: SUMMARY_MODEL, inputAmount: 80, outputAmount: 500, scale: 9 };

type Scripted = {
  content: string;
  promptTokens: number;
  completionTokens: number;
  signatureKind?: string;
  finishReason?: string | null;
};

function request(): Request {
  const headers = new Headers({
    origin: "https://demo.test",
    cookie: writeVisitorCookie(newVisitorSession(NOW), SECRET, false).split(";")[0] ?? "",
  });
  return new Request("https://demo.test/api/tee/deid", { method: "POST", headers });
}

function transport(replies: Scripted[]): { transport: LiveTransport; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    transport: {
      async verify() {
        return {
          gateway: {
            tcbStatus: "UpToDate",
            signer: { signingAlgo: "ed25519", signingAddress: "fictional-gateway" },
            tlsBinding: { kind: "none" },
          },
          models: [],
          verifiedAt: NOW,
        } as Awaited<ReturnType<LiveTransport["verify"]>>;
      },
      async create() {
        const reply = replies[calls];
        calls += 1;
        if (!reply) throw new Error("model call past the retry");
        return {
          id: `chatcmpl-${calls}`,
          choices: [{ finish_reason: reply.finishReason ?? "stop", message: { content: reply.content } }],
          usage: { prompt_tokens: reply.promptTokens, completion_tokens: reply.completionTokens },
        };
      },
      async verifyResponse() {
        const reply = replies[calls - 1];
        return {
          id: `chatcmpl-${calls}`,
          completionId: `chatcmpl-${calls}`,
          signatureKind: reply?.signatureKind ?? "provider_tee",
          signature: {
            kind: reply?.signatureKind ?? "provider_tee",
            signedText: "fictional signed note",
            signature: "fictional",
            signer: { signingAlgo: "ed25519", signingAddress: "fictional-model" },
          },
        } as Awaited<ReturnType<LiveTransport["verifyResponse"]>>;
      },
    },
  };
}

async function withDemo<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const keys = ["DEMO_ENC_SEED", "DEMO_PATIENT_ACCOUNT_ID", "PULSEFIT_ACCOUNT_ID", "BLOB_DIR"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const directory = await mkdtemp(path.join(tmpdir(), "rr-deid-retry-"));
  process.env.DEMO_ENC_SEED = "ab".repeat(32);
  process.env.DEMO_PATIENT_ACCOUNT_ID = "patient.test";
  process.env.PULSEFIT_ACCOUNT_ID = "pulsefit.test";
  process.env.BLOB_DIR = directory;
  try {
    return await run(directory);
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

async function postDeid(replies: Scripted[], directory: string, seed: SpendCall[] = []) {
  const ledger = path.join(directory, "ledger.md");
  if (seed.length > 0) await writeFile(ledger, renderLedger(seed));
  const script = transport(replies);
  let usage = { promptTokens: 0, completionTokens: 0 };
  let classified = 0;
  const live = liveDeidClient(undefined, { ledger, quoted: CHEAP, transport: script.transport });
  const store = memoryStore({ isolated: true });
  const response = await handleTeeDeid(request(), {
    now: NOW,
    store,
    secret: SECRET,
    keyConfigured: true,
    client: {
      deidentify: async (text) => {
        const result = await live.deidentify(text);
        usage = result.usage;
        return result;
      },
      classify: async () => {
        classified += 1;
        return { spans: [], usage: { promptTokens: 1, completionTokens: 0 } };
      },
    },
  });
  const body = (await response.json()) as { ok?: boolean; after?: string; reason?: string; error?: string; stage?: string };
  const recorded = await readLedger(ledger);
  return { response, body, usage, classified, calls: script.calls(), recorded, store };
}

test("malformed de-id JSON then a valid reply returns 200 and counts both calls", async () => {
  await withDemo(async (directory) => {
    const result = await postDeid(
      [
        { content: `{ "deidentified_text": "${CANARY}", }`, promptTokens: 11, completionTokens: 13 },
        { content: `{"deidentified_text":"${CLEAN}"}`, promptTokens: 17, completionTokens: 19 },
      ],
      directory,
    );
    assert.equal(result.response.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.after, CLEAN);
    assert.equal(JSON.stringify(result.body).includes(CANARY), false);
    assert.equal(JSON.stringify(result.body).includes("SyntaxError"), false);
    assert.equal(result.calls, 2);
    assert.equal(result.classified, 1);
    assert.equal(result.usage.promptTokens, 28);
    assert.equal(result.usage.completionTokens, 32);
    assert.equal(result.recorded.calls.length, 2);
    assert.equal(result.recorded.calls.every((call) => call.kind === "chat" && call.model === SUMMARY_MODEL), true);
    assert.equal(await dayUsage("ai", NOW, result.store), 1);
  });
});

test("two malformed de-id replies return 422 with the safe message", async () => {
  await withDemo(async (directory) => {
    const result = await postDeid(
      [
        { content: `{not-json ${CANARY}}`, promptTokens: 4, completionTokens: 5 },
        { content: `{still-bad ${CANARY}}`, promptTokens: 6, completionTokens: 7 },
      ],
      directory,
    );
    assert.equal(result.response.status, 422);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.stage, "tee");
    assert.equal(result.body.reason, `TEE de-id failed: ${DEID_NOT_JSON}`);
    assert.equal(JSON.stringify(result.body).includes(CANARY), false);
    assert.equal(JSON.stringify(result.body).includes("SyntaxError"), false);
    assert.equal(result.calls, 2);
    assert.equal(result.classified, 0);
    assert.equal(result.recorded.calls.length, 2);
    assert.equal(await dayUsage("ai", NOW, result.store), 1);
  });
});

test("non-JSON de-id errors are not retried", async () => {
  await withDemo(async (directory) => {
    const signature = await postDeid(
      [{ content: `{bad ${CANARY}}`, promptTokens: 3, completionTokens: 4, signatureKind: "gateway" }],
      directory,
    );
    assert.equal(signature.response.status, 422);
    assert.match(signature.body.reason ?? "", /provider_tee is required/);
    assert.equal(signature.calls, 1);
    assert.equal(signature.classified, 0);
    assert.equal(signature.recorded.calls.length, 1);

    const length = await postDeid(
      [
        {
          content: `{"deidentified_text":"${CLEAN}"}`,
          promptTokens: 3,
          completionTokens: 4,
          finishReason: "length",
        },
      ],
      path.join(directory, "length"),
    );
    assert.equal(length.response.status, 422);
    assert.match(length.body.reason ?? "", /finish_reason=length/);
    assert.equal(length.calls, 1);
    assert.equal(length.classified, 0);

    const missing = await postDeid(
      [{ content: '{"removed":[]}', promptTokens: 2, completionTokens: 2 }],
      path.join(directory, "missing"),
    );
    assert.equal(missing.response.status, 422);
    assert.match(missing.body.reason ?? "", /TEE de-id JSON missing deidentified_text/);
    assert.equal(missing.calls, 1);
    assert.equal(missing.classified, 0);
  });
});

test("a retry that would pass the spend cap is refused before a second model call", async () => {
  await withDemo(async (directory) => {
    const seed: SpendCall = {
      at: "2026-11-13T00:00:00.000Z",
      kind: "chat",
      model: SUMMARY_MODEL,
      promptTokens: 1,
      completionTokens: 1,
      usd: 3.996,
    };
    const result = await postDeid(
      [
        { content: `{bad ${CANARY}}`, promptTokens: 1000, completionTokens: 4096 },
        { content: `{"deidentified_text":"${CLEAN}"}`, promptTokens: 1000, completionTokens: 4096 },
      ],
      directory,
      [seed],
    );
    assert.equal(result.calls, 1);
    assert.equal(result.response.status, 503);
    assert.equal(result.body.error, "unavailable");
    assert.equal(result.recorded.calls.length, 2);
    assert.equal(result.recorded.calls[1]?.promptTokens, 1000);
    assert.equal(await dayUsage("ai", NOW, result.store), 1);
  });
});
