import assert from "node:assert/strict";
import { test } from "node:test";
import { claimIssuedReceipt, newVisitorSession, releaseIssuedReceipt, rememberIssuedReceipt } from "./visitor.ts";

test("one receipt is claimed once across two overlapping callers", async () => {
  const now = Date.UTC(2026, 10, 14, 9, 0, 0);
  const left = newVisitorSession(now);
  const right = newVisitorSession(now);
  right.sid = left.sid;
  const receipt = "ab".repeat(32);
  const artifact = "cd".repeat(32);
  rememberIssuedReceipt(left, receipt, artifact);
  rememberIssuedReceipt(right, receipt, artifact);
  const results = await Promise.all([claimIssuedReceipt(left, receipt, artifact), claimIssuedReceipt(right, receipt, artifact)]);
  assert.equal(results.filter(Boolean).length, 1);
  await releaseIssuedReceipt(left, receipt, artifact);
  await releaseIssuedReceipt(right, receipt, artifact);
});
