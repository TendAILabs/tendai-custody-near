import assert from "node:assert/strict";
import { test } from "node:test";
import { safeErrorMessage } from "../tee/completion.ts";
import { DEID_NOT_JSON, parseDeidJson, runDeidPipeline, type DeidModelClient, type LeakSpan } from "./pipeline.ts";

const identifiers = [
  { category: "name", value: "Maya Okafor" },
  { category: "mrn", value: "RB-004417" },
  { category: "phone", value: "555-0142" },
];

const source = "Maya Okafor MRN RB-004417 phone 555-0142 has chest tightness.";
const clean = "The patient has chest tightness.";
const zero = { promptTokens: 1, completionTokens: 1 };

function client(text: string, spans: LeakSpan[]): DeidModelClient {
  return {
    deidentify: async () => ({ text, usage: zero }),
    classify: async () => ({ spans, usage: zero }),
  };
}

test("parseDeidJson reads deidentified_text and ignores extra original fields", () => {
  const text = parseDeidJson('note {"deidentified_text":"Day +14 tightness","removed":[{"category":"date","original":"secret"}]}');
  assert.equal(text, "Day +14 tightness");
});

test("malformed de-id JSON uses the safe prefix instead of SyntaxError", () => {
  assert.throws(() => parseDeidJson('{ "deidentified_text": "Day +14 tightness", }'), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error instanceof SyntaxError, false);
    assert.equal(error.message, DEID_NOT_JSON);
    assert.equal(safeErrorMessage(error), DEID_NOT_JSON);
    return true;
  });
  assert.throws(() => parseDeidJson("note {not-json}"), (error: unknown) => {
    assert.equal(error instanceof Error && error.message, DEID_NOT_JSON);
    return true;
  });
});

test("share is blocked when the leak scan text still has a fixture identifier", async () => {
  let classified = false;
  const result = await runDeidPipeline({
    text: source,
    identifiers,
    anchorDate: "2026-10-14",
    client: {
      deidentify: async () => ({ text: "Maya Okafor has chest tightness.", usage: zero }),
      classify: async () => {
        classified = true;
        return { spans: [], usage: zero };
      },
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.stage, "tee");
  assert.equal(classified, false);
});

test("share is blocked when privacy-filter returns a span at or above 0.5", async () => {
  const result = await runDeidPipeline({
    text: source,
    identifiers,
    anchorDate: "2026-10-14",
    client: client(clean, [{ category: "private_person", start: 0, end: 3, score: 0.5, text: "The" }]),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.stage, "leak-scan");
});

test("share is allowed when the text is clean and spans stay under 0.5", async () => {
  const result = await runDeidPipeline({
    text: source,
    identifiers,
    anchorDate: "2026-10-14",
    client: client(clean, [{ category: "private_person", start: 0, end: 3, score: 0.49 }]),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.text, clean);
    assert.equal(result.localOnly, false);
  }
});

test("an empty length response is surfaced and chart text is not", async () => {
  const length = await runDeidPipeline({
    text: source,
    identifiers,
    anchorDate: "2026-10-14",
    client: {
      deidentify: async () => {
        throw new Error("TEE de-id stopped before a complete answer (finish_reason=length, content=empty).");
      },
      classify: async () => ({ spans: [], usage: zero }),
    },
  });
  assert.equal(length.ok, false);
  if (!length.ok) {
    assert.equal(length.stage, "tee");
    assert.match(length.reason, /finish_reason=length, content=empty/);
  }
  const leaked = await runDeidPipeline({
    text: source,
    identifiers,
    anchorDate: "2026-10-14",
    client: {
      deidentify: async () => {
        throw new Error('model said {"deidentified_text":"Maya Okafor"}');
      },
      classify: async () => ({ spans: [], usage: zero }),
    },
  });
  assert.equal(leaked.ok, false);
  if (!leaked.ok) {
    assert.equal(leaked.reason.includes("Maya"), false);
    assert.equal(leaked.reason.includes("{"), false);
  }
});

test("RR-06 without a TEE client the pipeline is not a clear share", async () => {
  const result = await runDeidPipeline({
    text: source,
    identifiers,
    anchorDate: "2026-10-14",
    client: null,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.stage, "tee");
});
