import assert from "node:assert/strict";
import { test } from "node:test";
import { accountUrl, eventExplorer, isTxHash, txUrl } from "./explorer.ts";

const TX = "5NU1XrRVKaYfjnfQ7Az378k9A2xC7CQPH4VocuwDXPQG";
const ACCOUNT = "rr6c9910d7.testnet";

test("transaction and account links use testnet NearBlocks", () => {
  assert.equal(txUrl(TX), `https://testnet.nearblocks.io/txns/${TX}`);
  assert.equal(accountUrl(ACCOUNT), `https://testnet.nearblocks.io/address/${ACCOUNT}`);
});

test("a known transaction hash wins over the account", () => {
  const link = eventExplorer({ tx: TX, accountId: ACCOUNT, contractId: ACCOUNT });
  assert.equal(link.kind, "tx");
  assert.equal(link.href, txUrl(TX));
});

test("without a transaction hash the link opens the account, not a selector", () => {
  const link = eventExplorer({ tx: "stub-tx-open-88c01de", accountId: ACCOUNT, contractId: "other.testnet" });
  assert.equal(link.kind, "account");
  assert.equal(link.href, accountUrl(ACCOUNT));
  assert.equal(link.href.includes("explorer.testnet.near.org"), false);
  assert.equal(link.href.includes("explorer.near.org"), false);
});

test("without an account the link opens the contract", () => {
  const link = eventExplorer({ tx: null, accountId: "not an account", contractId: ACCOUNT });
  assert.equal(link.kind, "contract");
  assert.equal(link.href, accountUrl(ACCOUNT));
});

test("stub hashes and empty strings are not transaction links", () => {
  assert.equal(isTxHash("stub-tx-referral-7f3ac21"), false);
  assert.equal(isTxHash(""), false);
  assert.equal(isTxHash(TX), true);
});
