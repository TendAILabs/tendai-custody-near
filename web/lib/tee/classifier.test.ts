import assert from "node:assert/strict";
import { test } from "node:test";
import { runDeidPipeline } from "../deid/pipeline.ts";
import { CLASSIFIER_SCHEMA_ERROR, parseClassifierBody } from "./classifier.ts";

const text = "The patient has chest tightness.";
const span = { category: "private_person", start: 0, end: 3, score: 0.2 };

function row(spans: unknown, extra: Record<string, unknown> = {}) {
  return { data: [{ spans, ...extra }] };
}

test("a missing spans array fails closed", () => {
  assert.throws(() => parseClassifierBody({}, text.length), new RegExp(CLASSIFIER_SCHEMA_ERROR));
  assert.throws(() => parseClassifierBody({ data: [{}] }, text.length), new RegExp(CLASSIFIER_SCHEMA_ERROR));
  assert.throws(() => parseClassifierBody({ data: [{ spans: null }] }, text.length), new RegExp(CLASSIFIER_SCHEMA_ERROR));
});

test("an item count other than one row fails closed", () => {
  assert.throws(() => parseClassifierBody({ data: [] }, text.length), new RegExp(CLASSIFIER_SCHEMA_ERROR));
  assert.throws(() => parseClassifierBody({ data: [{ spans: [] }, { spans: [] }] }, text.length), new RegExp(CLASSIFIER_SCHEMA_ERROR));
  assert.throws(() => parseClassifierBody(row([span], { span_count: 2 }), text.length), new RegExp(CLASSIFIER_SCHEMA_ERROR));
  assert.deepEqual(parseClassifierBody(row([], { span_count: 0 }), text.length), []);
});

test("a non-finite score fails closed", () => {
  for (const score of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "0.4", null, 1.2]) {
    assert.throws(() => parseClassifierBody(row([{ ...span, score }]), text.length), new RegExp(CLASSIFIER_SCHEMA_ERROR));
  }
});

test("an unknown category fails closed", () => {
  assert.throws(() => parseClassifierBody(row([{ ...span, category: "secret" }]), text.length), new RegExp(CLASSIFIER_SCHEMA_ERROR));
  assert.throws(() => parseClassifierBody(row([{ ...span, category: "PRIVATE_PERSON" }]), text.length), new RegExp(CLASSIFIER_SCHEMA_ERROR));
  assert.equal(parseClassifierBody(row([span]), text.length)[0]?.category, "private_person");
});

test("an invalid offset fails closed", () => {
  const bad = [
    { ...span, start: -1, end: 3 },
    { ...span, start: 3, end: 3 },
    { ...span, start: 4, end: 2 },
    { ...span, start: 0, end: text.length + 1 },
    { ...span, start: 1.5, end: 3 },
  ];
  for (const item of bad) {
    assert.throws(() => parseClassifierBody(row([item]), text.length), new RegExp(CLASSIFIER_SCHEMA_ERROR));
  }
});

test("a malformed classifier span does not count as a clean scan", async () => {
  const result = await runDeidPipeline({
    text: "Maya Okafor has chest tightness.",
    identifiers: [{ category: "name", value: "Maya Okafor" }],
    anchorDate: "2026-10-14",
    client: {
      deidentify: async () => ({ text, usage: { promptTokens: 1, completionTokens: 1 } }),
      classify: async () => ({ spans: [{ category: "secret", start: 0, end: 3, score: Number.NaN }], usage: { promptTokens: 1, completionTokens: 0 } }),
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.stage, "leak-scan");
});
