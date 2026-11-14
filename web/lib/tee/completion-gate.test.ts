import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { memoryStore } from "../guard/visitor.ts";
import { newVisitorSession, writeVisitorCookie } from "../session/visitor.ts";
import { handleTeeDeid } from "./deid-handler.ts";
import { liveDeidClient, teeSummary, type LiveTransport } from "./live.ts";
import { handleTeeSummary } from "./summary-handler.ts";
import { SUMMARY_SAFE_ERROR } from "./summary-error.ts";
import {
  collectChatStream,
  requireAssistantText,
  ACCEPTED_SUMMARY,
  requireSummaryProse,
  safeErrorMessage,
  SUMMARY_MODEL,
  type ChatChunkLike,
  type CompletionLike,
} from "./completion.ts";
import type { ModelPrice } from "./spend.ts";

const CANARY = "canary-shape-9f3a";
const PLAIN = "Chest tightness improves with rest.";
const CHART = "exertional chest tightness that improves with rest";
const LABELS = ["TEE de-id", "NEAR AI summary"] as const;
const SECRET = "test-session-secret";
const SHARE = "1";
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const CHEAP: ModelPrice = { model: SUMMARY_MODEL, inputAmount: 80, outputAmount: 500, scale: 9 };

type Shape = { name: string; reason: RegExp; completion: CompletionLike; summaryOnly?: boolean };

const stop = (message: Record<string, unknown>, finish: unknown = "stop"): CompletionLike => ({
  choices: [{ finish_reason: finish, message }],
});

const SHAPES: Shape[] = [
  {
    name: "refusal",
    reason: /finish_reason=refusal, content=present/,
    completion: stop({ content: PLAIN, refusal: CANARY }),
  },
  {
    name: "tool_calls",
    reason: /finish_reason=tool_calls, content=present/,
    completion: stop({ content: PLAIN, tool_calls: [{ id: "1", function: { name: "emit", arguments: CANARY } }] }),
  },
  {
    name: "reasoning field carrying the answer",
    reason: /finish_reason=reasoning, content=empty/,
    completion: stop({ content: " ", reasoning: CANARY }),
  },
  {
    name: "reasoning_content field carrying the answer",
    reason: /finish_reason=reasoning, content=empty/,
    completion: stop({ content: "", reasoning_content: CANARY }),
  },
  {
    name: "structured reasoning beside text",
    reason: /finish_reason=reasoning, content=present/,
    completion: stop({ content: PLAIN, reasoning: { answer: CANARY } }),
  },
  {
    name: "structured reasoning_content beside text",
    reason: /finish_reason=reasoning, content=present/,
    completion: stop({ content: PLAIN, reasoning_content: [{ text: CANARY }] }),
  },
  {
    name: "extra choices",
    reason: /finish_reason=extra_choices, content=present/,
    completion: {
      choices: [
        { finish_reason: "stop", message: { content: PLAIN } },
        { finish_reason: "stop", message: { content: CANARY } },
      ],
    },
  },
  {
    name: "choice index other than zero",
    reason: /finish_reason=extra_choices, content=present/,
    completion: { choices: [{ index: 1, finish_reason: "stop", message: { content: CANARY } }] },
  },
  {
    name: "zero choices",
    reason: /finish_reason=missing, content=empty/,
    completion: { choices: [] },
  },
  {
    name: "array content",
    reason: /finish_reason=non_string, content=non_string/,
    completion: stop({ content: [{ type: "text", text: CANARY }] }),
  },
  {
    name: "object content",
    reason: /finish_reason=non_string, content=non_string/,
    completion: stop({ content: { text: CANARY, trim: () => CANARY } }),
  },
  {
    name: "null content",
    reason: /finish_reason=stop, content=empty/,
    completion: stop({ content: null }),
  },
  {
    name: "finish_reason content_filter",
    reason: /finish_reason=content_filter, content=present/,
    completion: stop({ content: CANARY }, "content_filter"),
  },
  {
    name: "finish_reason tool_calls",
    reason: /finish_reason=tool_calls, content=present/,
    completion: stop({ content: CANARY }, "tool_calls"),
  },
  {
    name: "finish_reason function_call",
    reason: /finish_reason=function_call, content=present/,
    completion: stop({ content: CANARY }, "function_call"),
  },
  {
    name: "function_call field",
    reason: /finish_reason=function_call, content=present/,
    completion: stop({ content: PLAIN, function_call: { name: "emit", arguments: CANARY } }),
  },
  {
    name: "missing finish_reason",
    reason: /finish_reason=missing, content=present/,
    completion: { choices: [{ message: { content: CANARY } }] },
  },
  {
    name: "null finish_reason",
    reason: /finish_reason=missing, content=present/,
    completion: stop({ content: CANARY }, null),
  },
  {
    name: "unknown finish_reason",
    reason: /finish_reason=unknown, content=present/,
    completion: stop({ content: PLAIN }, CANARY),
  },
  {
    name: "whitespace-only text",
    reason: /finish_reason=stop, content=empty/,
    completion: stop({ content: " \n\t " }),
  },
  {
    name: "wrong schema",
    reason: /finish_reason=schema, content=present/,
    summaryOnly: true,
    completion: stop({ content: `{"summary":"${CANARY}"}` }),
  },
  {
    name: "truncated text labeled stop",
    reason: /finish_reason=truncated, content=present/,
    summaryOnly: true,
    completion: stop({ content: `Exertional chest tightness that improves with ${CANARY}` }),
  },
];

function hidden(value: string): boolean {
  return !value.includes(CANARY);
}

function assertClosed(error: unknown, label: (typeof LABELS)[number], reason: RegExp): void {
  assert.ok(error instanceof Error);
  assert.match(error.message, reason);
  assert.equal(error.message.startsWith(`${label} stopped before a complete answer`), true);
  assert.equal(hidden(error.message), true);
  assert.equal(error.message.includes(PLAIN), false);
  assert.equal(error.message.includes("{"), false);
  assert.equal(error.message.includes("}"), false);
  assert.equal(safeErrorMessage(error), error.message);
}

function streamFor(completion: CompletionLike): ChatChunkLike[] {
  const choices = Array.isArray(completion.choices) ? completion.choices : [];
  if (choices.length === 0) return [{ id: "chatcmpl-1", choices: [] }];
  return [
    {
      id: "chatcmpl-1",
      choices: choices.map((choice) => {
        const record = choice && typeof choice === "object" ? (choice as Record<string, unknown>) : {};
        const message =
          record.message && typeof record.message === "object" && !Array.isArray(record.message)
            ? (record.message as Record<string, unknown>)
            : {};
        return {
          index: typeof record.index === "number" ? record.index : 0,
          finish_reason: record.finish_reason,
          delta: {
            content: message.content,
            refusal: message.refusal,
            tool_calls: message.tool_calls,
            function_call: message.function_call,
            reasoning: message.reasoning,
            reasoning_content: message.reasoning_content,
          },
        };
      }),
    },
  ];
}

for (const shape of SHAPES) {
  test(`fail closed on ${shape.name}`, async () => {
    const labels = shape.summaryOnly ? (["NEAR AI summary"] as const) : LABELS;
    for (const label of labels) {
      if (shape.summaryOnly) {
        const text = requireAssistantText(shape.completion, label);
        assert.throws(
          () => requireSummaryProse(text),
          (error: unknown) => {
            assertClosed(error, label, shape.reason);
            return true;
          },
        );
      } else {
        assert.throws(
          () => requireAssistantText(shape.completion, label),
          (error: unknown) => {
            assertClosed(error, label, shape.reason);
            return true;
          },
        );
      }
      await assert.rejects(collectChatStream(streamFor(shape.completion), undefined, label), (error: unknown) => {
        assertClosed(error, label, shape.reason);
        return true;
      });
    }
    if (!shape.summaryOnly) return;
    const deid = requireAssistantText(shape.completion, "TEE de-id");
    assert.equal(hidden(deid), false);
    const streamed = await collectChatStream(streamFor(shape.completion), undefined, "TEE de-id");
    assert.equal(hidden(streamed.content), false);
  });
}

test("refusal prose, a fragment, and a refused status do not get a receipt", async () => {
  const refused = [
    { name: "explicit refusal prose", text: "I cannot provide this summary.", reason: /finish_reason=refusal/ },
    { name: "fragment prose", text: "Chest discomfort associated with.", reason: /finish_reason=schema/ },
    {
      name: "refusal status",
      text: '{"status":"refused","reason":"Chest tightness improves with rest.","findings":"Blood pressure is elevated.","medicines":"No medicine is listed."}',
      reason: /finish_reason=refusal/,
    },
  ];
  await withTmp(async (directory) => {
    for (const [index, item] of refused.entries()) {
      assert.throws(() => requireSummaryProse(item.text), item.reason);
      const script = receiptTransport([stop({ content: item.text }), GOOD]);
      await assert.rejects(
        () =>
          teeSummary(CHART, undefined, {
            ledger: path.join(directory, `refused-${index}`),
            quoted: CHEAP,
            transport: script.transport,
          }),
        item.reason,
      );
      assert.equal(script.calls(), 1, item.name);
      assert.equal(script.receipts(), 0, item.name);
    }
  });
  const accepted = requireSummaryProse(
    '{"status":"ok","reason":"Chest tightness on stairs resolves with rest.","findings":"The tightness improves with rest.","medicines":"The chart lists no current medicine."}',
  );
  assert.equal(accepted.includes("Reason:"), true);
  assert.equal(accepted.includes("status"), false);
});

test("a plain stop summary is the only accepted answer, including a string thinking trace", async () => {
  for (const label of LABELS) {
    const text = requireAssistantText(
      stop({
        content: `  ${PLAIN}  `,
        refusal: null,
        tool_calls: [],
        function_call: null,
        reasoning: null,
        reasoning_content: `scratch ${CANARY}`,
      }),
      label,
    );
    assert.equal(text, PLAIN);
    assert.equal(hidden(text), true);
  }
  const collected = await collectChatStream(
    [
      {
        id: "chatcmpl-1",
        choices: [{ index: 0, delta: { content: ACCEPTED_SUMMARY, reasoning_content: CANARY }, finish_reason: "stop" }],
      },
      { id: "chatcmpl-1", choices: [], usage: { prompt_tokens: 12, completion_tokens: 40 } },
    ],
    undefined,
    "NEAR AI summary",
  );
  assert.equal(collected.id, "chatcmpl-1");
  assert.equal(collected.content, ACCEPTED_SUMMARY);
  assert.equal(hidden(collected.content), true);
  assert.equal(collected.finishReason, "stop");
  assert.equal(collected.completionTokens, 40);
});

test("a later stop does not wash out content_filter on the stream", async () => {
  await assert.rejects(
    () =>
      collectChatStream(
        [
          { choices: [{ delta: { content: CANARY }, finish_reason: "content_filter" }] },
          { choices: [{ delta: { content: " ok" }, finish_reason: "stop" }] },
        ],
        undefined,
        "TEE de-id",
      ),
    (error: unknown) => {
      assertClosed(error, "TEE de-id", /finish_reason=content_filter, content=present/);
      return true;
    },
  );
});

function receiptTransport(completions: CompletionLike[]): {
  transport: LiveTransport;
  calls: () => number;
  receipts: () => number;
} {
  let calls = 0;
  let receipts = 0;
  return {
    calls: () => calls,
    receipts: () => receipts,
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
        const completion = completions[calls];
        calls += 1;
        if (!completion) throw new Error("model call past the script");
        return {
          ...completion,
          id: `chatcmpl-${calls}`,
          usage: { prompt_tokens: 3, completion_tokens: 4 },
        };
      },
      async verifyResponse() {
        receipts += 1;
        return {
          id: `chatcmpl-${calls}`,
          completionId: `chatcmpl-${calls}`,
          signatureKind: "provider_tee",
          signature: {
            kind: "provider_tee",
            signedText: "fictional signed note",
            signature: "fictional",
            signer: { signingAlgo: "ed25519", signingAddress: "fictional-model" },
          },
        } as Awaited<ReturnType<LiveTransport["verifyResponse"]>>;
      },
    },
  };
}

const GOOD: CompletionLike = stop({ content: PLAIN, refusal: null, tool_calls: null });

async function withTmp<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(path.join(tmpdir(), "rr-f10-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("a rejected completion is not retried and never reaches the receipt path", async () => {
  await withTmp(async (directory) => {
    for (const [index, shape] of SHAPES.entries()) {
      const summary = receiptTransport([shape.completion, GOOD]);
      const summaryLedger = path.join(directory, `summary-${index}`);
      await assert.rejects(
        () =>
          teeSummary(CHART, undefined, {
            ledger: summaryLedger,
            quoted: CHEAP,
            transport: summary.transport,
          }),
        (error: unknown) => {
          assertClosed(error, "NEAR AI summary", shape.reason);
          return true;
        },
      );
      assert.equal(summary.calls(), 1, shape.name);
      assert.equal(summary.receipts(), 0, shape.name);
      if (shape.summaryOnly) continue;

      const deid = receiptTransport([shape.completion, GOOD]);
      const deidLedger = path.join(directory, `deid-${index}`);
      const client = liveDeidClient(undefined, { ledger: deidLedger, quoted: CHEAP, transport: deid.transport });
      await assert.rejects(client.deidentify("chest tightness"), (error: unknown) => {
        assertClosed(error, "TEE de-id", shape.reason);
        return true;
      });
      assert.equal(deid.calls(), 1, shape.name);
      assert.equal(deid.receipts(), 0, shape.name);
    }
  });
});

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

function summaryRequest(): Request {
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
    body: JSON.stringify({ chart: CHART, shareId: SHARE }),
  });
}

test("the summary handler does not issue a receipt for a rejected completion", async () => {
  await withTmp(async (directory) => {
    const script = receiptTransport([stop({ content: CANARY }, "content_filter"), GOOD]);
    const seen = await capturing(() =>
      handleTeeSummary(summaryRequest(), {
        now: NOW,
        store: memoryStore({ isolated: true }),
        secret: SECRET,
        keyConfigured: true,
        summarize: (chart) =>
          teeSummary(chart, undefined, {
            ledger: path.join(directory, "ledger.md"),
            quoted: CHEAP,
            transport: script.transport,
          }),
      }),
    );
    const body = (await seen.value.json()) as { error?: string; text?: string; receiptJson?: string; receiptHash?: string };
    assert.equal(seen.value.status, 502);
    assert.equal(body.error, SUMMARY_SAFE_ERROR);
    assert.equal(body.text, undefined);
    assert.equal(body.receiptJson, undefined);
    assert.equal(body.receiptHash, undefined);
    assert.equal(script.calls(), 1);
    assert.equal(script.receipts(), 0);
    assert.equal(hidden(`${seen.logs}\n${JSON.stringify(body)}`), true);
  });
});

test("the de-id handler does not issue a receipt for a rejected completion", async () => {
  await withTmp(async (directory) => {
    const keys = ["DEMO_ENC_SEED", "DEMO_PATIENT_ACCOUNT_ID", "PULSEFIT_ACCOUNT_ID", "BLOB_DIR"] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.DEMO_ENC_SEED = "ab".repeat(32);
    process.env.DEMO_PATIENT_ACCOUNT_ID = "patient.test";
    process.env.PULSEFIT_ACCOUNT_ID = "pulsefit.test";
    process.env.BLOB_DIR = directory;
    try {
      const script = receiptTransport([stop({ content: CANARY, tool_calls: [{ id: "1", function: { arguments: CANARY } }] }), GOOD]);
      const headers = new Headers({
        origin: "https://demo.test",
        cookie: writeVisitorCookie(newVisitorSession(NOW), SECRET, false).split(";")[0] ?? "",
      });
      const seen = await capturing(() =>
        handleTeeDeid(new Request("https://demo.test/api/tee/deid", { method: "POST", headers }), {
          now: NOW,
          store: memoryStore({ isolated: true }),
          secret: SECRET,
          keyConfigured: true,
          client: liveDeidClient(undefined, {
            ledger: path.join(directory, "ledger.md"),
            quoted: CHEAP,
            transport: script.transport,
          }),
        }),
      );
      const body = (await seen.value.json()) as { ok?: boolean; reason?: string; receiptHash?: string; artifactHash?: string };
      assert.equal(seen.value.status, 422);
      assert.equal(body.ok, false);
      assert.match(body.reason ?? "", /finish_reason=tool_calls/);
      assert.equal(body.receiptHash, undefined);
      assert.equal(body.artifactHash, undefined);
      assert.equal(script.calls(), 1);
      assert.equal(script.receipts(), 0);
      assert.equal(hidden(`${seen.logs}\n${JSON.stringify(body)}`), true);
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

test("a plain stop summary still reaches one provider_tee receipt and omits the thinking trace", async () => {
  await withTmp(async (directory) => {
    const script = receiptTransport([
      stop({ content: ` ${ACCEPTED_SUMMARY} `, reasoning_content: CANARY, refusal: null, tool_calls: null }),
    ]);
    const seen = await capturing(() =>
      handleTeeSummary(summaryRequest(), {
        now: NOW,
        store: memoryStore({ isolated: true }),
        secret: SECRET,
        keyConfigured: true,
        summarize: (chart) =>
          teeSummary(chart, undefined, {
            ledger: path.join(directory, "ledger.md"),
            quoted: CHEAP,
            transport: script.transport,
          }),
      }),
    );
    const body = (await seen.value.json()) as { text?: string; signatureKind?: string; receiptJson?: string };
    assert.equal(seen.value.status, 200);
    assert.equal(body.text, ACCEPTED_SUMMARY);
    assert.equal(body.signatureKind, "provider_tee");
    assert.match(body.receiptJson ?? "", /"signatureKind":"provider_tee"/);
    assert.equal(script.calls(), 1);
    assert.equal(script.receipts(), 1);
    assert.equal(hidden(`${seen.logs}\n${JSON.stringify(body)}`), true);
  });
});
