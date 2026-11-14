import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../../app/api/blob/route.ts";
import { allowRequest, openLimitKey, resetLimits } from "./limit.ts";

test("blob GET uses the open admission window before any ticket work", async () => {
  resetLimits();
  const previous = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    const request = new Request(`https://demo.test/api/blob?hash=${"ab".repeat(32)}&account_id=hospital.testnet&nonce=${"11".repeat(32)}&share_id=4`);
    const key = openLimitKey(request);
    for (let index = 0; index < 30; index += 1) assert.equal(allowRequest(key, 30, 60_000), true);
    const response = await GET(request);
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error, "rate limit");
  } finally {
    resetLimits();
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});
