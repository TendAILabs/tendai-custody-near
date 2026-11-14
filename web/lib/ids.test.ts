import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalU64 } from "./ids.ts";

test("a u64 id accepts only a bounded decimal string", () => {
  for (const value of ["01", "001", " 1", "+1", "1e0", "0x1", "18446744073709551616"]) {
    assert.equal(canonicalU64(value), null, value);
  }
  for (const value of ["0", "1", "18446744073709551615"]) {
    assert.equal(canonicalU64(value), value);
  }
});
