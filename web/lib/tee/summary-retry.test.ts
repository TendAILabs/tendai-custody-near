import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ApiError } from "@nearai/inference-sdk/node";
import { memoryStore, dayUsage } from "../guard/visitor.ts";
import { newVisitorSession, writeVisitorCookie } from "../session/visitor.ts";
import { ACCEPTED_SUMMARY, summarySectionText, SUMMARY_MAX_TOKENS, SUMMARY_MODEL } from "./completion.ts";
import { POST as postLiveRoute } from "../../app/api/tee/live/route.ts";
import { POST as postSummaryRoute } from "../../app/api/tee/summary/route.ts";
import { liveDeidClient, SUMMARY_UPSTREAM_ATTEMPT_CAP, teeLiveSummary, teeSummary, type LiveTransport } from "./live.ts";
import { handleTeeLive } from "./live-handler.ts";
import { SUMMARY_IDENTIFIER_ERROR, SUMMARY_SAFE_ERROR } from "./summary-error.ts";
import { handleTeeSummary } from "./summary-handler.ts";
import { readLedger, renderLedger, tokensToUsd, type ModelPrice, type SpendCall } from "./spend.ts";

const SECRET = "test-session-secret";
const SHARE = "1";
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const CHART = "exertional chest tightness that improves with rest";
const CLEAN = ACCEPTED_SUMMARY;
const NAMED = summarySectionText(
  "Jane Doe has chest tightness that resolves with rest.",
  "The tightness improves with rest.",
  "The chart lists no current medicine.",
);
const REMINDER = "Omit names, IDs, dates of birth, addresses, phone numbers, and emails. Fictional data only.";
const CANARY = "upstream-body-canary-9f3a";
const CHEAP: ModelPrice = { model: SUMMARY_MODEL, inputAmount: 80, outputAmount: 500, scale: 9 };

type Failure = { error: Error; where?: "create" | "verifyResponse" };

type Scripted = {
  fail?: Failure;
  content: string;
  promptTokens: number;
  completionTokens: number;
  signatureKind?: string;
  finishReason?: string | null;
};

function statusError(status: number): Error {
  return Object.assign(new Error(`upstream HTTP ${status} ${CANARY}`), { status });
}

function sdkStatus(status: number): Error {
  return new ApiError({
    code: "api.http_status",
    details: { resource: "completion", status },
    retryable: status === 429 || status >= 500,
  });
}

function failed(error: Error, where?: Failure["where"]): Scripted {
  return { fail: { error, where }, content: "", promptTokens: 0, completionTokens: 0 };
}

function ok(over: Partial<Scripted> = {}): Scripted {
  return {
    content: CLEAN,
    promptTokens: 17,
    completionTokens: 19,
    ...over,
  };
}

function request(body: string): Request {
  const session = newVisitorSession(NOW);
  session.shares.push(SHARE);
  const headers = new Headers({
    origin: "https://demo.test",
    "content-type": "application/json",
    cookie: writeVisitorCookie(session, SECRET, false).split(";")[0] ?? "",
  });
  return new Request("https://demo.test/api/tee/summary", {
    method: "POST",
    headers,
    body,
  });
}

function transport(replies: Scripted[]): { transport: LiveTransport; calls: () => number; prompts: string[] } {
  let calls = 0;
  const prompts: string[] = [];
  return {
    calls: () => calls,
    prompts,
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
      async create(body: Parameters<LiveTransport["create"]>[0]) {
        prompts.push(body.messages.map((message) => message.content).join("\n"));
        const reply = replies[calls];
        calls += 1;
        if (!reply) throw new Error("model call past the retry");
        if (reply.fail && (reply.fail.where ?? "create") === "create") throw reply.fail.error;
        return {
          id: `chatcmpl-${calls}`,
          choices: [{ finish_reason: reply.finishReason ?? "stop", message: { content: reply.content } }],
          usage: { prompt_tokens: reply.promptTokens, completion_tokens: reply.completionTokens },
        };
      },
      async verifyResponse() {
        const reply = replies[calls - 1];
        if (reply?.fail?.where === "verifyResponse") throw reply.fail.error;
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
  const directory = await mkdtemp(path.join(tmpdir(), "rr-summary-retry-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function assertCounted(call: SpendCall | undefined, promptTokens?: number, completionTokens?: number) {
  assert.ok(call);
  assert.equal(call.kind, "chat");
  assert.equal(call.model, SUMMARY_MODEL);
  assert.equal(call.usd > 0, true);
  if (promptTokens != null) assert.equal(call.promptTokens, promptTokens);
  if (completionTokens != null) assert.equal(call.completionTokens, completionTokens);
  const expected = tokensToUsd(CHEAP, call.promptTokens, call.completionTokens);
  assert.ok(Math.abs(call.usd - expected) < 1e-12);
}

async function postSummary(
  replies: Scripted[],
  directory: string,
  seed: SpendCall[] = [],
  options?: { retryKeptIdentifier?: boolean; chart?: string },
) {
  await mkdir(directory, { recursive: true });
  const ledger = path.join(directory, "ledger.md");
  if (seed.length > 0) await writeFile(ledger, renderLedger(seed));
  const script = transport(replies);
  const store = memoryStore({ isolated: true });
  const chart = options?.chart ?? CHART;
  const response = await handleTeeSummary(request(JSON.stringify({ chart, shareId: SHARE })), {
    now: NOW,
    store,
    secret: SECRET,
    keyConfigured: true,
    summarize: (input) =>
      teeSummary(input, undefined, {
        ledger,
        quoted: CHEAP,
        transport: script.transport,
        retryKeptIdentifier: options?.retryKeptIdentifier,
      }),
  });
  const body = (await response.json()) as {
    text?: string;
    error?: string;
    signatureKind?: string;
    receiptJson?: string;
    gatewayTcb?: string;
    gatewaySigner?: string;
    gatewayTls?: string;
    modelGpu?: string;
    modelSigner?: string;
  };
  const recorded = await readLedger(ledger);
  const ledgerText = await readFile(ledger, "utf8");
  return { response, body, calls: script.calls(), prompts: script.prompts, recorded, ledgerText, store };
}

test("a transient upstream failure then a verified summary returns 200 and counts both attempts", async () => {
  await withDemo(async (directory) => {
    const cases: Scripted[][] = [
      [failed(statusError(502)), ok()],
      [failed(sdkStatus(503)), ok()],
      [failed(new Error(`504 gateway timeout ${CANARY}`)), ok()],
      [failed(new TypeError(`fetch failed ${CANARY}`, { cause: Object.assign(new Error("reset"), { code: "ECONNRESET" }) })), ok()],
      [
        failed(
          new ApiError(
            { code: "api.transport_failed", details: { resource: "completion", reason: "request" }, retryable: true },
            { cause: Object.assign(new Error("timed out"), { name: "TimeoutError" }) },
          ),
        ),
        ok(),
      ],
      [{ ...failed(sdkStatus(504), "verifyResponse"), content: CLEAN, promptTokens: 21, completionTokens: 23 }, ok()],
    ];
    for (const [index, replies] of cases.entries()) {
      const result = await postSummary(replies, path.join(directory, String(index)));
      assert.equal(result.response.status, 200, String(index));
      assert.equal(result.body.text, CLEAN);
      assert.equal(result.body.signatureKind, "provider_tee");
      assert.equal(JSON.stringify(result.body).includes(CANARY), false);
      assert.equal(result.calls, 2, String(index));
      assert.equal(result.recorded.calls.length, 2, String(index));
      const [first, second] = result.recorded.calls;
      if (replies[0]?.fail?.where === "verifyResponse") assertCounted(first, 21, 23);
      else assertCounted(first, undefined, SUMMARY_MAX_TOKENS);
      assertCounted(second, replies[1]?.promptTokens, replies[1]?.completionTokens);
      assert.equal(await dayUsage("ai", NOW, result.store), 1);
    }
  });
});

test("two transient upstream failures return the safe summary error and count both attempts", async () => {
  await withDemo(async (directory) => {
    const result = await postSummary([failed(statusError(502)), failed(sdkStatus(503))], directory);
    assert.equal(result.response.status, 502);
    assert.equal(result.body.error, SUMMARY_SAFE_ERROR);
    assert.equal(Object.keys(result.body).join(","), "error");
    assert.equal(JSON.stringify(result.body).includes(CANARY), false);
    assert.equal(JSON.stringify(result.body).includes("HTTP"), false);
    assert.equal(result.calls, 2);
    assert.equal(result.recorded.calls.length, 2);
    assertCounted(result.recorded.calls[0], undefined, SUMMARY_MAX_TOKENS);
    assertCounted(result.recorded.calls[1], undefined, SUMMARY_MAX_TOKENS);
    assert.equal(result.recorded.calls[0]?.usd, result.recorded.calls[1]?.usd);
    assert.equal(await dayUsage("ai", NOW, result.store), 1);
  });
});

test("4xx and a non-transient 500 are not retried, and the one attempt is still counted", async () => {
  await withDemo(async (directory) => {
    const replies = [failed(statusError(400)), failed(sdkStatus(429)), failed(sdkStatus(500)), failed(statusError(500))];
    for (const [index, reply] of replies.entries()) {
      const result = await postSummary([reply, ok()], path.join(directory, String(index)));
      assert.equal(result.response.status, 502, String(index));
      assert.equal(result.body.error, SUMMARY_SAFE_ERROR);
      assert.equal(JSON.stringify(result.body).includes(CANARY), false);
      assert.equal(result.calls, 1, String(index));
      assert.equal(result.recorded.calls.length, 1, String(index));
      assertCounted(result.recorded.calls[0], undefined, SUMMARY_MAX_TOKENS);
      assert.equal(await dayUsage("ai", NOW, result.store), 1);
    }
  });
});

test("a missing provider_tee receipt and a short answer are not retried", async () => {
  await withDemo(async (directory) => {
    const signature = await postSummary(
      [ok({ signatureKind: "gateway", promptTokens: 5, completionTokens: 6 }), ok()],
      path.join(directory, "signature"),
    );
    assert.equal(signature.response.status, 502);
    assert.equal(signature.body.error, SUMMARY_SAFE_ERROR);
    assert.equal(signature.calls, 1);
    assert.equal(signature.recorded.calls.length, 1);
    assertCounted(signature.recorded.calls[0], 5, 6);

    const length = await postSummary(
      [ok({ finishReason: "length", promptTokens: 7, completionTokens: 8 }), ok()],
      path.join(directory, "length"),
    );
    assert.equal(length.response.status, 502);
    assert.equal(length.body.error, SUMMARY_SAFE_ERROR);
    assert.equal(length.calls, 1);
    assertCounted(length.recorded.calls[0], 7, 8);
  });
});

const REFUSAL = "Jane";

function hidden(value: string): boolean {
  return !value.includes(REFUSAL) && !value.includes(NAMED);
}

async function capturing<T>(run: () => Promise<T>): Promise<{ value: T; logs: string }> {
  const lines: string[] = [];
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const previous = methods.map((method) => console[method].bind(console));
  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      lines.push(args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" "));
    };
  }
  try {
    return { value: await run(), logs: lines.join("\n") };
  } finally {
    for (const [index, method] of methods.entries()) console[method] = previous[index] as (typeof console)[typeof method];
  }
}

test("an output identifier refusal then a clean summary returns 200 after two attempts", async () => {
  await withDemo(async (directory) => {
    const seen = await capturing(() =>
      postSummary(
        [ok({ content: NAMED, promptTokens: 9, completionTokens: 10 }), ok({ promptTokens: 15, completionTokens: 16 })],
        directory,
      ),
    );
    const result = seen.value;
    assert.equal(result.response.status, 200);
    assert.equal(result.body.text, CLEAN);
    assert.equal(result.body.signatureKind, "provider_tee");
    assert.equal(result.body.gatewayTcb, "UpToDate");
    assert.equal(result.body.gatewaySigner, "ed25519 fictional-gateway");
    assert.equal(result.body.modelGpu, "none");
    assert.match(result.body.receiptJson ?? "", /"signatureKind":"provider_tee"/);
    assert.equal(result.calls, 2);
    assert.equal(result.recorded.calls.length, 2);
    assertCounted(result.recorded.calls[0], 9, 10);
    assertCounted(result.recorded.calls[1], 15, 16);
    assert.equal(result.prompts.length, 2);
    assert.equal(result.prompts[0]?.includes(REMINDER), false);
    assert.equal(result.prompts[1]?.includes(REMINDER), true);
    assert.equal(hidden(result.prompts[1] ?? ""), true);
    assert.equal(hidden(`${seen.logs}\n${JSON.stringify(result.body)}\n${result.ledgerText}`), true);
    assert.equal(await dayUsage("ai", NOW, result.store), 1);
  });
});

test("two output identifier refusals return 422 after two attempts and the refused text is never logged", async () => {
  await withDemo(async (directory) => {
    const seen = await capturing(() =>
      postSummary(
        [
          ok({ content: NAMED, promptTokens: 9, completionTokens: 10 }),
          ok({ content: NAMED, promptTokens: 11, completionTokens: 12 }),
          ok(),
        ],
        directory,
      ),
    );
    const result = seen.value;
    assert.equal(result.response.status, 422);
    assert.equal(result.body.error, SUMMARY_IDENTIFIER_ERROR);
    assert.equal(Object.keys(result.body).join(","), "error");
    assert.equal(result.calls, 2);
    assert.equal(result.recorded.calls.length, 2);
    assertCounted(result.recorded.calls[0], 9, 10);
    assertCounted(result.recorded.calls[1], 11, 12);
    assert.equal(result.prompts.length, 2);
    assert.equal(result.prompts[1]?.includes(REMINDER), true);
    assert.equal(hidden(result.prompts[1] ?? ""), true);
    assert.equal(hidden(`${seen.logs}\n${JSON.stringify(result.body)}\n${result.ledgerText}`), true);
    assert.equal(await dayUsage("ai", NOW, result.store), 1);
  });
});

test("a transient 502 then an identifier refusal then a clean summary stays within three attempts", async () => {
  await withDemo(async (directory) => {
    assert.equal(SUMMARY_UPSTREAM_ATTEMPT_CAP, 3);
    const seen = await capturing(() =>
      postSummary(
        [
          failed(statusError(502)),
          ok({ content: NAMED, promptTokens: 11, completionTokens: 12 }),
          ok({ promptTokens: 13, completionTokens: 14 }),
          ok(),
        ],
        directory,
      ),
    );
    const result = seen.value;
    assert.equal(result.response.status, 200);
    assert.equal(result.body.text, CLEAN);
    assert.equal(result.body.signatureKind, "provider_tee");
    assert.equal(result.calls, 3);
    assert.equal(result.recorded.calls.length, 3);
    assertCounted(result.recorded.calls[0], undefined, SUMMARY_MAX_TOKENS);
    assertCounted(result.recorded.calls[1], 11, 12);
    assertCounted(result.recorded.calls[2], 13, 14);
    assert.equal(result.prompts.length, 3);
    assert.equal(result.prompts[0]?.includes(REMINDER), false);
    assert.equal(result.prompts[1]?.includes(REMINDER), false);
    assert.equal(result.prompts[2]?.includes(REMINDER), true);
    assert.equal(hidden(result.prompts[2] ?? ""), true);
    assert.equal(hidden(`${seen.logs}\n${JSON.stringify(result.body)}`), true);
    assert.equal(await dayUsage("ai", NOW, result.store), 1);
  });
});

test("an input-side identifier refusal is not retried", async () => {
  await withDemo(async (directory) => {
    const seen = await capturing(() =>
      postSummary(
        [failed(new Error("The request kept a personal identifier")), ok()],
        path.join(directory, "request"),
        [],
        { chart: `${NAMED} Chest tightness improves with rest.` },
      ),
    );
    const refused = seen.value;
    assert.equal(refused.calls, 1);
    assert.equal(refused.prompts.length, 1);
    assert.equal(refused.prompts[0]?.includes(REMINDER), false);
    assert.equal(refused.response.status, 502);
    assert.equal(refused.body.error, SUMMARY_SAFE_ERROR);
    assert.equal(hidden(`${seen.logs}\n${JSON.stringify(refused.body)}\n${refused.ledgerText}`), true);

    const clean = await postSummary(
      [ok(), ok({ content: NAMED })],
      path.join(directory, "chart"),
      [],
      { chart: "Seen as Jane Doe. Chest tightness improves with rest." },
    );
    assert.equal(clean.response.status, 200);
    assert.equal(clean.body.text, CLEAN);
    assert.equal(clean.calls, 1);
    assert.equal(hidden(JSON.stringify(clean.body)), true);
  });
});

test("the live route does not regenerate when model output keeps an identifier", async () => {
  await withDemo(async (directory) => {
    const ledger = path.join(directory, "ledger.md");
    const script = transport([ok({ content: NAMED, promptTokens: 9, completionTokens: 10 }), ok()]);
    const store = memoryStore({ isolated: true });
    const session = newVisitorSession(NOW);
    const headers = new Headers({
      origin: "https://demo.test",
      cookie: writeVisitorCookie(session, SECRET, false).split(";")[0] ?? "",
    });
    const routeDeps = {
      ready: async () => {},
      now: NOW,
      store,
      secret: SECRET,
      keyConfigured: true,
      ledger,
      quoted: CHEAP,
      transport: script.transport,
    };
    const seen = await capturing(() =>
      postLiveRoute(new Request("https://demo.test/api/tee/live", { method: "POST", headers }), routeDeps),
    );
    const text = await seen.value.text();
    assert.equal(seen.value.status, 200);
    assert.match(text, /"stage":"done"/);
    assert.match(text, /"signatureKind":"provider_tee"/);
    assert.equal(script.calls(), 1);
    assert.equal(script.prompts.length, 1);
    assert.equal(script.prompts[0]?.includes(REMINDER), false);
    assert.equal(hidden(`${seen.logs}\n${text}`), true);

    const summaryLedger = path.join(directory, "summary-ledger.md");
    const summaryScript = transport([ok({ content: NAMED, promptTokens: 9, completionTokens: 10 }), ok()]);
    const summary = await postSummaryRoute(request(JSON.stringify({ chart: CHART, shareId: SHARE })), {
      ready: async () => {},
      now: NOW,
      store: memoryStore({ isolated: true }),
      secret: SECRET,
      keyConfigured: true,
      ledger: summaryLedger,
      quoted: CHEAP,
      transport: summaryScript.transport,
    });
    const summaryBody = (await summary.json()) as { text?: string; error?: string };
    assert.equal(summary.status, 200);
    assert.equal(summaryBody.text, CLEAN);
    assert.equal(summaryScript.calls(), 2);
    assert.equal(summaryScript.prompts[0]?.includes(REMINDER), false);
    assert.equal(summaryScript.prompts[1]?.includes(REMINDER), true);
    assert.equal(hidden(JSON.stringify(summaryBody)), true);
  });
});

test("a budget refusal stops the identifier regeneration before another model call", async () => {
  await withDemo(async (directory) => {
    const probe = await postSummary([failed(statusError(502))], path.join(directory, "probe"), [], {
      retryKeptIdentifier: false,
    });
    const estimate = probe.recorded.calls[0]?.usd ?? 0;
    assert.ok(estimate > 0 && estimate < 1);
    const actual = tokensToUsd(CHEAP, 9, 10);
    const seed: SpendCall = {
      at: "2026-11-13T00:00:00.000Z",
      kind: "chat",
      model: SUMMARY_MODEL,
      promptTokens: 1,
      completionTokens: 1,
      usd: 4 - estimate - actual / 2,
    };
    const seen = await capturing(() =>
      postSummary(
        [ok({ content: NAMED, promptTokens: 9, completionTokens: 10 }), ok()],
        path.join(directory, "cap"),
        [seed],
      ),
    );
    const result = seen.value;
    assert.equal(result.calls, 1);
    assert.equal(result.response.status, 502);
    assert.equal(result.body.error, SUMMARY_SAFE_ERROR);
    assert.equal(JSON.stringify(result.body).includes("Refusing"), false);
    assert.equal(hidden(`${seen.logs}\n${JSON.stringify(result.body)}\n${result.ledgerText}`), true);
    assert.equal(result.recorded.calls.length, 2);
    assertCounted(result.recorded.calls[1], 9, 10);
    assert.equal(await dayUsage("ai", NOW, result.store), 1);
  });
});

test("a missing provider_tee receipt on the regeneration is an error, not a success", async () => {
  await withDemo(async (directory) => {
    const seen = await capturing(() =>
      postSummary(
        [
          ok({ content: NAMED, promptTokens: 9, completionTokens: 10 }),
          ok({ signatureKind: "gateway", promptTokens: 5, completionTokens: 6 }),
          ok(),
        ],
        directory,
      ),
    );
    const result = seen.value;
    assert.equal(result.calls, 2);
    assert.equal(result.response.status, 502);
    assert.equal(result.body.error, SUMMARY_SAFE_ERROR);
    assert.equal(result.body.text, undefined);
    assert.equal(result.body.signatureKind, undefined);
    assert.equal(result.recorded.calls.length, 2);
    assertCounted(result.recorded.calls[0], 9, 10);
    assertCounted(result.recorded.calls[1], 5, 6);
    assert.equal(hidden(`${seen.logs}\n${JSON.stringify(result.body)}\n${result.ledgerText}`), true);
    assert.equal(await dayUsage("ai", NOW, result.store), 1);
  });
});

test("a retry that would pass the spend cap is refused before a second model call", async () => {
  await withDemo(async (directory) => {
    const probe = await postSummary([failed(statusError(502)), failed(statusError(502))], path.join(directory, "probe"));
    const estimate = probe.recorded.calls[0]?.usd ?? 0;
    assert.ok(estimate > 0 && estimate < 1);
    const seed: SpendCall = {
      at: "2026-11-13T00:00:00.000Z",
      kind: "chat",
      model: SUMMARY_MODEL,
      promptTokens: 1,
      completionTokens: 1,
      usd: 4 - estimate * 1.5,
    };
    const result = await postSummary(
      [failed(statusError(502)), ok()],
      path.join(directory, "cap"),
      [seed],
    );
    assert.equal(result.calls, 1);
    assert.equal(result.response.status, 502);
    assert.equal(result.body.error, SUMMARY_SAFE_ERROR);
    assert.equal(JSON.stringify(result.body).includes("Refusing"), false);
    assert.equal(JSON.stringify(result.body).includes("No request"), false);
    assert.equal(result.recorded.calls.length, 2);
    assertCounted(result.recorded.calls[1], undefined, SUMMARY_MAX_TOKENS);
    assert.equal(await dayUsage("ai", NOW, result.store), 1);
  });
});

test("the live route retries one transient failure and skips output regeneration", async () => {
  await withDemo(async (directory) => {
    const ledger = path.join(directory, "ledger.md");
    const script = transport([failed(statusError(502)), ok()]);
    const store = memoryStore({ isolated: true });
    const session = newVisitorSession(NOW);
    const headers = new Headers({
      origin: "https://demo.test",
      cookie: writeVisitorCookie(session, SECRET, false).split(";")[0] ?? "",
    });
    const response = await handleTeeLive(new Request("https://demo.test/api/tee/live", { method: "POST", headers }), {
      now: NOW,
      store,
      secret: SECRET,
      keyConfigured: true,
      summarize: (chart, progress) => teeLiveSummary(chart, progress, { ledger, quoted: CHEAP, transport: script.transport }),
    });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(text, /"stage":"done"/);
    assert.match(text, /"signatureKind":"provider_tee"/);
    assert.equal(text.includes(CANARY), false);
    assert.equal(script.calls(), 2);
    const recorded = await readLedger(ledger);
    assert.equal(recorded.calls.length, 2);
    assert.equal(await dayUsage("ai", NOW, store), 1);
  });
});

test("de-id keeps a single attempt when the upstream call fails transiently", async () => {
  await withDemo(async (directory) => {
    const ledger = path.join(directory, "ledger.md");
    const script = transport([failed(statusError(502)), ok()]);
    const client = liveDeidClient(undefined, { ledger, quoted: CHEAP, transport: script.transport });
    await assert.rejects(() => client.deidentify("chest tightness"), /HTTP 502/);
    assert.equal(script.calls(), 1);
    assert.equal((await readLedger(ledger)).calls.length, 0);
  });
});
