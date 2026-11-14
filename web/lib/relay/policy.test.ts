import assert from "node:assert/strict";
import { test } from "node:test";
import { assertTeeModel, TEE_MODEL } from "./policy.ts";

test("the configured TEE model is accepted", () => {
  assert.doesNotThrow(() => assertTeeModel(TEE_MODEL));
});

test("an Incognito model id throws at startup", () => {
  assert.throws(() => assertTeeModel("openai/gpt-4o"), /non-TEE model id openai\/gpt-4o/);
  assert.throws(() => assertTeeModel("anthropic/claude"), /non-TEE/);
});
