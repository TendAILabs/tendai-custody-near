import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalDeviceKey, memoryKeyStore, publicDevice } from "./keys.ts";
import { networkWarning } from "./network.ts";
import { signLocalCall } from "./patient-sign.ts";
import { filterSharesToSession } from "../relay/session-shares.ts";

test("a device key stays off the public view and signs without sending the secret", async () => {
  const record = createLocalDeviceKey();
  const store = memoryKeyStore();
  await store.save(record);
  const loaded = await store.load();
  assert.equal(loaded?.accountId, record.accountId);
  assert.equal(record.accountId.length, 64);
  assert.match(record.accountId, /^[0-9a-f]{64}$/);
  assert.equal(record.encPublicHex.length, 64);
  const pub = JSON.stringify(publicDevice(record));
  assert.equal(pub.includes("secret"), false);
  const seen: { accountId: string; methodName: string; deposit: bigint }[] = [];
  const signed = await signLocalCall(record, "approve_share", { share_id: "4" }, "1", async (call) => {
    seen.push({ accountId: call.accountId, methodName: call.methodName, deposit: call.deposit });
    assert.equal(Object.hasOwn(call, "secret"), false);
    assert.equal(call.accountId.includes(":"), false);
    return { hash: "TxHash111111111111111111", value: null };
  });
  assert.equal(signed.hash, "TxHash111111111111111111");
  assert.equal(seen[0]?.deposit, 1n);
  assert.equal(seen[0]?.methodName, "approve_share");
  assert.equal(seen[0]?.accountId, record.accountId);
});

test("network warnings and session share filters", () => {
  assert.equal(networkWarning("maya.testnet", "testnet"), "");
  assert.match(networkWarning("maya.near", "testnet"), /mainnet/);
  assert.match(networkWarning("maya.testnet", "mainnet"), /testnet/);
  const rows = [{ id: "4" }, { id: "8" }, { id: "9" }];
  assert.deepEqual(filterSharesToSession(rows, ["9", "4"]), [{ id: "4" }, { id: "9" }]);
  assert.deepEqual(filterSharesToSession(rows, []), []);
});
