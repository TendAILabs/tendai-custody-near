import assert from "node:assert/strict";
import { test } from "node:test";
import { custodyAad, encryptionContext, randomRequestId } from "./context.ts";

const HEX = (byte: string) => byte.repeat(32);

test("encryption context matches the Rust vectors", () => {
  assert.equal(
    encryptionContext({
      contractId: "relay.sandbox",
      caller: "clinic.sandbox",
      method: "CreateRecord",
      requestId: HEX("11"),
    }),
    "2ce8c064a938779d314ebc58b1bf1f3d6a0e425b7318741fcc75adec2ccc7d2e",
  );
  assert.equal(
    encryptionContext({
      contractId: "relay.testnet",
      caller: "maya.testnet",
      method: "CreateShare",
      requestId: HEX("22"),
    }),
    "f7da5f253316c3301d58363ccf2968f98dbaab9849ea852868478ce9415abd35",
  );
  assert.equal(
    encryptionContext({
      contractId: "relay.testnet",
      caller: "hospital.testnet",
      method: "SubmitReply",
      requestId: HEX("33"),
    }),
    "0325ae3c891afdae97fac923cf817517974cef81391e10405f5a162bb4d452d2",
  );
});

test("contract, caller, method, and request id each change the context", () => {
  const base = encryptionContext({
    contractId: "relay.testnet",
    caller: "maya.testnet",
    method: "CreateShare",
    requestId: HEX("22"),
  });
  assert.notEqual(base, encryptionContext({ contractId: "other.testnet", caller: "maya.testnet", method: "CreateShare", requestId: HEX("22") }));
  assert.notEqual(base, encryptionContext({ contractId: "relay.testnet", caller: "clinic.testnet", method: "CreateShare", requestId: HEX("22") }));
  assert.notEqual(base, encryptionContext({ contractId: "relay.testnet", caller: "maya.testnet", method: "CreateRecord", requestId: HEX("22") }));
  assert.notEqual(base, encryptionContext({ contractId: "relay.testnet", caller: "maya.testnet", method: "CreateShare", requestId: HEX("23") }));
});

test("custody aad uses the context and not a predicted numeric id", () => {
  const context = encryptionContext({
    contractId: "relay.testnet",
    caller: "clinic.testnet",
    method: "CreateRecord",
    requestId: HEX("11"),
  });
  const aad = custodyAad({
    contractId: "relay.testnet",
    creator: "clinic.testnet",
    contextHex: context,
    artifactType: "record-section",
    section: "history",
  });
  assert.equal(aad.includes("|1|"), false);
  assert.equal(aad.includes(context), true);
  assert.equal(aad.startsWith("referral_relay/v2|near:testnet|relay.testnet|clinic.testnet|"), true);
  assert.equal(aad.endsWith("|record-section|history"), true);
});

test("random request ids are 32-byte hex", () => {
  const first = randomRequestId();
  const second = randomRequestId();
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});
