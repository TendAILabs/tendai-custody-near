import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryStore } from "../guard/visitor.ts";
import { openNonceKey } from "../open/handle.ts";
import { spendCounterKey } from "../tee/spend.ts";
import { claimFaucetAccount, faucetFundingKey } from "../visitor/limits.ts";
import { authorizationDomain, domainTag } from "./domain.ts";
import { authorizeStoryMethod, newVisitorSession, readVisitorSession, writeVisitorCookie } from "./visitor.ts";

const SECRET = "cutover-session-secret";
const NOW = Date.UTC(2026, 10, 14, 8, 0, 0);

async function withContract<T>(contractId: string, run: () => T | Promise<T>): Promise<T> {
  const previous = process.env.RELAY_CONTRACT_ID;
  process.env.RELAY_CONTRACT_ID = contractId;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.RELAY_CONTRACT_ID;
    else process.env.RELAY_CONTRACT_ID = previous;
  }
}

test("an old cookie is rejected when the contract id changes, even if share ids collide", async () => {
  const session = newVisitorSession(NOW);
  session.shares.push("4");
  session.records.push("4");
  const cookie = await withContract("old-relay.testnet", () => writeVisitorCookie(session, SECRET, false));
  const rejected = await withContract("fresh-relay.testnet", () => readVisitorSession(cookie.split(";")[0] ?? "", SECRET, NOW));
  assert.equal(rejected, null);
  const colliding = newVisitorSession(NOW);
  colliding.shares.push("4");
  const allowed = await withContract("fresh-relay.testnet", () => authorizeStoryMethod(colliding, "revoke_share", { share_id: "4" }));
  assert.equal(allowed.ok, true);
  const same = await withContract("old-relay.testnet", () => readVisitorSession(cookie.split(";")[0] ?? "", SECRET, NOW));
  assert.equal(same?.shares.includes("4"), true);
  assert.notEqual(await withContract("old-relay.testnet", () => authorizationDomain()), await withContract("fresh-relay.testnet", () => authorizationDomain()));
  assert.notEqual(await withContract("old-relay.testnet", () => domainTag()), await withContract("fresh-relay.testnet", () => domainTag()));
});

test("changing the contract does not reset AI spend or faucet budget keys", async () => {
  const store = memoryStore({ isolated: true });
  const previous = process.env.RELAY_CONTRACT_ID;
  process.env.RELAY_CONTRACT_ID = "old-relay.testnet";
  try {
    const spend = spendCounterKey();
    const faucet = faucetFundingKey("visitor.testnet");
    const nonce = openNonceKey("share:4:visitor.testnet:ab");
    assert.equal(await claimFaucetAccount(store, "visitor.testnet"), true);
    process.env.RELAY_CONTRACT_ID = "fresh-relay.testnet";
    assert.equal(spendCounterKey(), spend);
    assert.equal(faucetFundingKey("visitor.testnet"), faucet);
    assert.equal(spend.includes("old-relay.testnet"), false);
    assert.equal(faucet.includes("old-relay.testnet"), false);
    assert.notEqual(openNonceKey("share:4:visitor.testnet:ab"), nonce);
    assert.equal(await claimFaucetAccount(store, "visitor.testnet"), false);
  } finally {
    if (previous === undefined) delete process.env.RELAY_CONTRACT_ID;
    else process.env.RELAY_CONTRACT_ID = previous;
  }
});
