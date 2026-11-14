import assert from "node:assert/strict";
import test from "node:test";
import { contractMethodMissing } from "./schema.ts";

test("schema 2 timeline absence is a missing method", () => {
  assert.equal(
    contractMethodMissing(new Error("wasm execution failed with error: FunctionCallError(MethodResolveError(MethodNotFound))")),
    true,
  );
  assert.equal(contractMethodMissing(new Error("MethodResolveError(MethodNotFound)")), true);
  assert.equal(contractMethodMissing(new Error("Contract method is not found at block height 277641094")), true);
});

test("a rate limit or a missing account is not a missing method", () => {
  assert.equal(contractMethodMissing(new Error("429 rate limit")), false);
  assert.equal(contractMethodMissing(new Error("account relay.testnet does not exist while viewing")), false);
});
