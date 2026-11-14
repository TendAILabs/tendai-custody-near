import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEID_CLIENT_TIMEOUT_MS, DEID_TIMEOUT_MESSAGE, deidClientFailure } from "./deid-timeout.ts";

test("deid client timeout asks the visitor to retry the leak scan", () => {
  assert.equal(DEID_CLIENT_TIMEOUT_MS, 290_000);
  const aborted = deidClientFailure(new DOMException("The operation was aborted", "AbortError"));
  const timedOut = deidClientFailure(new DOMException("The operation timed out", "TimeoutError"));
  assert.equal(aborted, DEID_TIMEOUT_MESSAGE);
  assert.equal(timedOut, DEID_TIMEOUT_MESSAGE);
  assert.match(aborted, /took too long/);
  assert.match(aborted, /leak scan/);
  assert.equal(deidClientFailure(new Error("sign failed")), "sign failed");
  assert.match(deidClientFailure("nope"), /leak scan/);
});

test("deid route allows 300 seconds", () => {
  const source = readFileSync(new URL("../../app/api/tee/deid/route.ts", import.meta.url), "utf8");
  assert.match(source, /export const maxDuration = 300\b/);
});
