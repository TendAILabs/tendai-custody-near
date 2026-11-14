import assert from "node:assert/strict";
import { test } from "node:test";
import { requireNearAiKey } from "./live.ts";

test("missing NEARAI_API_KEY fails before any request", () => {
  const previous = process.env.NEARAI_API_KEY;
  delete process.env.NEARAI_API_KEY;
  try {
    assert.throws(() => requireNearAiKey(), /NEARAI_API_KEY is not set/);
  } finally {
    if (previous === undefined) delete process.env.NEARAI_API_KEY;
    else process.env.NEARAI_API_KEY = previous;
  }
});
