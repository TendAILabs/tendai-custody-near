import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cipherHash,
  decryptEnvelope,
  encryptEnvelope,
  generateX25519KeyPair,
  rewrapEnvelope,
  sectionAad,
} from "./envelope.ts";

const plaintext = new TextEncoder().encode("fictional chest tightness, resolves with rest");

test("roundtrip encrypts to the recipient and hashes the canonical envelope", () => {
  const maya = generateX25519KeyPair();
  const aad = sectionAad("r-1", "history");
  const envelope = encryptEnvelope({
    plaintext,
    aad,
    recipients: [{ account_id: "maya.sandbox", publicKey: maya.publicKey }],
  });
  const opened = decryptEnvelope({
    envelope,
    account_id: "maya.sandbox",
    secretKey: maya.secretKey,
    expectedAad: aad,
  });
  assert.deepEqual(opened, plaintext);
  assert.equal(cipherHash(envelope).length, 64);
  assert.match(envelope.alg, /xchacha20poly1305/);
});

test("wrong key fails", () => {
  const maya = generateX25519KeyPair();
  const other = generateX25519KeyPair();
  const envelope = encryptEnvelope({
    plaintext,
    aad: sectionAad("r-1", "history"),
    recipients: [{ account_id: "maya.sandbox", publicKey: maya.publicKey }],
  });
  assert.throws(() =>
    decryptEnvelope({
      envelope,
      account_id: "maya.sandbox",
      secretKey: other.secretKey,
      expectedAad: sectionAad("r-1", "history"),
    }),
  );
});

test("AAD swap fails", () => {
  const maya = generateX25519KeyPair();
  const history = sectionAad("r-1", "history");
  const notes = sectionAad("r-1", "notes");
  const envelope = encryptEnvelope({
    plaintext,
    aad: history,
    recipients: [{ account_id: "maya.sandbox", publicKey: maya.publicKey }],
  });
  assert.throws(() =>
    decryptEnvelope({
      envelope,
      account_id: "maya.sandbox",
      secretKey: maya.secretKey,
      expectedAad: notes,
    }),
  );
  const swapped = { ...envelope, aad: notes };
  assert.throws(() =>
    decryptEnvelope({
      envelope: swapped,
      account_id: "maya.sandbox",
      secretKey: maya.secretKey,
      expectedAad: notes,
    }),
  );
});

test("tampered ciphertext fails", () => {
  const maya = generateX25519KeyPair();
  const aad = sectionAad("r-1", "labs");
  const envelope = encryptEnvelope({
    plaintext,
    aad,
    recipients: [{ account_id: "maya.sandbox", publicKey: maya.publicKey }],
  });
  const bytes = Buffer.from(envelope.ciphertext, "base64");
  bytes[0] ^= 0xff;
  const tampered = { ...envelope, ciphertext: bytes.toString("base64") };
  assert.throws(() =>
    decryptEnvelope({
      envelope: tampered,
      account_id: "maya.sandbox",
      secretKey: maya.secretKey,
      expectedAad: aad,
    }),
  );
});

test("re-wrap to a second recipient works", () => {
  const maya = generateX25519KeyPair();
  const hospital = generateX25519KeyPair();
  const aad = sectionAad("s-4", "summary");
  const envelope = encryptEnvelope({
    plaintext,
    aad,
    recipients: [{ account_id: "maya.sandbox", publicKey: maya.publicKey }],
  });
  const rewrapped = rewrapEnvelope({
    envelope,
    account_id: "maya.sandbox",
    secretKey: maya.secretKey,
    recipients: [
      { account_id: "maya.sandbox", publicKey: maya.publicKey },
      { account_id: "hospital.sandbox", publicKey: hospital.publicKey },
    ],
  });
  assert.equal(rewrapped.ciphertext, envelope.ciphertext);
  assert.notEqual(cipherHash(rewrapped), cipherHash(envelope));
  for (const key of [
    { account_id: "maya.sandbox", secretKey: maya.secretKey },
    { account_id: "hospital.sandbox", secretKey: hospital.secretKey },
  ]) {
    const opened = decryptEnvelope({ ...key, envelope: rewrapped, expectedAad: aad });
    assert.deepEqual(opened, plaintext);
  }
});
