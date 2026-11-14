import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDeidJson } from "../deid/pipeline.ts";
import {
  chatBody,
  collectChatStream,
  DEID_MAX_TOKENS,
  requireAssistantText,
  safeErrorMessage,
  SUMMARY_MAX_TOKENS,
} from "./completion.ts";

test("empty content with finish_reason length fails before JSON parsing", () => {
  assert.throws(
    () => requireAssistantText({ choices: [{ finish_reason: "length", message: { content: "" } }] }, "TEE de-id"),
    /finish_reason=length, content=empty/,
  );
  assert.throws(
    () =>
      parseDeidJson(
        requireAssistantText(
          { choices: [{ finish_reason: "length", message: { content: '{"deidentified_text":"ok"}' } }] },
          "TEE de-id",
        ),
      ),
    /finish_reason=length, content=present/,
  );
});

test("a stopped answer is returned and a clean JSON answer can be parsed", () => {
  const text = requireAssistantText(
    { choices: [{ finish_reason: "stop", message: { content: ' {"deidentified_text":"Day +14 tightness"} ' } }] },
    "TEE de-id",
  );
  assert.equal(parseDeidJson(text), "Day +14 tightness");
});

test("stream collection keeps the completion id and usage for verifyResponse", async () => {
  const collected = await collectChatStream([
    { id: "chatcmpl-1", choices: [{ delta: { content: "The " }, finish_reason: null }] },
    { id: "chatcmpl-1", choices: [{ delta: { content: "patient." }, finish_reason: "stop" }] },
    { id: "chatcmpl-1", choices: [], usage: { prompt_tokens: 12, completion_tokens: 40 } },
  ]);
  assert.equal(collected.id, "chatcmpl-1");
  assert.equal(collected.content, "The patient.");
  assert.equal(collected.finishReason, "stop");
  assert.equal(collected.completionTokens, 40);
});

test("chat bodies use the raised token limits and documented minimal reasoning", () => {
  assert.equal(chatBody("summary", SUMMARY_MAX_TOKENS).max_tokens, 3072);
  assert.equal(chatBody("deid", DEID_MAX_TOKENS).max_tokens, 4096);
  assert.equal(chatBody("summary", SUMMARY_MAX_TOKENS).reasoning_effort, "low");
  assert.equal(chatBody("summary", SUMMARY_MAX_TOKENS).stream, false);
});

test("safeErrorMessage drops an environment value", () => {
  const secret = "unit-test-secret-value-9f3a";
  const previous = process.env.GUARD_TEST_SECRET;
  process.env.GUARD_TEST_SECRET = secret;
  try {
    const hidden = safeErrorMessage(new Error(`upstream failed ${secret}`));
    assert.equal(hidden.includes(secret), false);
    assert.equal(hidden.includes("GUARD_TEST_SECRET"), false);
  } finally {
    if (previous === undefined) delete process.env.GUARD_TEST_SECRET;
    else process.env.GUARD_TEST_SECRET = previous;
  }
});

test("safeErrorMessage keeps the length error and drops chart text", () => {
  const surfaced = safeErrorMessage(
    new Error("TEE de-id stopped before a complete answer (finish_reason=length, content=empty)."),
  );
  assert.match(surfaced, /finish_reason=length/);
  const hidden = safeErrorMessage(new Error('bad {"deidentified_text":"Maya Okafor"}'));
  assert.equal(hidden.includes("Maya"), false);
  assert.equal(hidden.includes("{"), false);
});
