import assert from "node:assert/strict";
import { test } from "node:test";
import { cipherHash, encryptEnvelope, generateX25519KeyPair, sectionAad } from "../crypto/envelope.ts";
import { flipCiphertextByte, recipientPublicKey, rejectSwappedArtifact } from "./keys.ts";

test("a server-offered key is ignored when it differs from the chain", () => {
  const chain = "ab".repeat(32);
  const server = "cd".repeat(32);
  const chosen = recipientPublicKey({ chainHex: chain, serverHex: server });
  assert.equal(chosen.publicKeyHex, chain);
  assert.match(chosen.warning ?? "", /on-chain key/);
  assert.equal(recipientPublicKey({ chainHex: chain, serverHex: chain }).warning, null);
});

test("an envelope served for another share is rejected before decrypt", () => {
  const hospital = generateX25519KeyPair();
  const first = encryptEnvelope({
    plaintext: new TextEncoder().encode("share one"),
    aad: sectionAad("1", "history"),
    recipients: [{ account_id: "hospital.testnet", publicKey: hospital.publicKey }],
  });
  const second = encryptEnvelope({
    plaintext: new TextEncoder().encode("share two"),
    aad: sectionAad("2", "history"),
    recipients: [{ account_id: "hospital.testnet", publicKey: hospital.publicKey }],
  });
  const onChain = cipherHash(first);
  assert.doesNotThrow(() => rejectSwappedArtifact(cipherHash(first), onChain));
  assert.throws(() => rejectSwappedArtifact(cipherHash(second), onChain), /envelope swap/);
});

test("flipping one ciphertext byte changes the envelope hash", () => {
  const hospital = generateX25519KeyPair();
  const envelope = encryptEnvelope({
    plaintext: new TextEncoder().encode("share one"),
    aad: sectionAad("1", "history"),
    recipients: [{ account_id: "hospital.testnet", publicKey: hospital.publicKey }],
  });
  const flipped = { ...envelope, ciphertext: flipCiphertextByte(envelope.ciphertext) };
  assert.notEqual(cipherHash(flipped), cipherHash(envelope));
  assert.throws(() => rejectSwappedArtifact(cipherHash(flipped), cipherHash(envelope)), /envelope swap/);
});
