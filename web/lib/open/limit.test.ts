import assert from "node:assert/strict";
import { test } from "node:test";
import { allowRequest, openLimitKey, resetLimits } from "./limit.ts";

test("the signing and open routes stop after the window fills", () => {
  resetLimits();
  for (let i = 0; i < 3; i += 1) assert.equal(allowRequest("open", 3, 1000, 1_000), true);
  assert.equal(allowRequest("open", 3, 1000, 1_500), false);
  assert.equal(allowRequest("open", 3, 1000, 2_100), true);
});

test("L3 the open limiter key follows the visitor IP", () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const left = new Request("https://demo.test/api/open", { headers: { "x-real-ip": "203.0.113.10" } });
    const right = new Request("https://demo.test/api/open", { headers: { "x-real-ip": "203.0.113.11" } });
    assert.equal(openLimitKey(left), "open:203.0.113.10");
    assert.notEqual(openLimitKey(left), openLimitKey(right));
    assert.equal(openLimitKey(left), openLimitKey(left));
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});
