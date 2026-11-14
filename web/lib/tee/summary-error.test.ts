import assert from "node:assert/strict";
import { test } from "node:test";
import { SUMMARY_SAFE_ERROR, summaryFailure } from "./summary-error.ts";

test("L1 a summary 502 returns a static error and logs only a correlation id and status", () => {
  const marker = "UPSTREAM_LEAK_MARKER";
  const token = "sk-not-a-real-token";
  const upstream = new Error(`502 bad gateway ${marker} <html>${token} chart words`);
  const failure = summaryFailure(upstream);
  const other = summaryFailure(new Error(`attest failed for ${marker}`));
  assert.equal(failure.status, 502);
  assert.equal(other.status, 502);
  assert.equal(failure.body.error, SUMMARY_SAFE_ERROR);
  assert.equal(other.body.error, SUMMARY_SAFE_ERROR);
  assert.equal(Object.keys(failure.body).join(","), "error");
  const packed = `${JSON.stringify(failure.body)}\n${failure.log}\n${other.log}`;
  assert.equal(packed.includes(marker), false);
  assert.equal(packed.includes(token), false);
  assert.equal(packed.includes("bad gateway"), false);
  assert.equal(packed.includes("<html>"), false);
  assert.equal(packed.includes("chart words"), false);
  assert.match(failure.log, /^\[tee-summary\] POST 502 correlation=[0-9a-f]{16} status=502$/);
  assert.match(other.log, /^\[tee-summary\] POST 502 correlation=[0-9a-f]{16} status=unavailable$/);
  assert.notEqual(failure.log, other.log);
});
