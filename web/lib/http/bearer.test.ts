import assert from "node:assert/strict";
import { test } from "node:test";
import { bearerMatches } from "./bearer.ts";

test("L6 bearer comparison uses equal-length buffers", () => {
  const secret = "session-secret-value";
  assert.equal(bearerMatches(`Bearer ${secret}`, secret), true);
  const sameLength = `Bearer ${secret.slice(0, -1)}X`;
  assert.equal(sameLength.length, `Bearer ${secret}`.length);
  assert.equal(bearerMatches(sameLength, secret), false);
  assert.equal(bearerMatches("Bearer short", secret), false);
  assert.equal(bearerMatches(null, secret), false);
  assert.equal(bearerMatches(`Bearer ${secret}`, ""), false);
});
