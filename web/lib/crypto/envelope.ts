import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";

export const ENVELOPE_ALG = "x25519-hkdf-sha256+xchacha20poly1305" as const;
const WRAP_INFO = utf8ToBytes("referral-relay/v1/wrap");

export type RecipientWrap = {
  account_id: string;
  epk: string;
  wrap_nonce: string;
  wrapped_dek: string;
};

export type EnvelopeV1 = {
  v: 1;
  alg: typeof ENVELOPE_ALG;
  aad: string;
  nonce: string;
  ciphertext: string;
  recipients: RecipientWrap[];
};

export type RecipientKey = {
  account_id: string;
  publicKey: Uint8Array;
};

export type X25519KeyPair = {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
};

export function generateX25519KeyPair(): X25519KeyPair {
  const secretKey = x25519.utils.randomSecretKey();
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

export function x25519KeyPairFromSecret(secretKey: Uint8Array): X25519KeyPair {
  if (secretKey.length !== 32) throw new Error("X25519 secret key must be 32 bytes");
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

export function publicKeyToHex(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) throw new Error("X25519 public key must be 32 bytes");
  return bytesToHex(publicKey);
}

export function encryptEnvelope(opts: {
  plaintext: Uint8Array;
  aad: string;
  recipients: RecipientKey[];
}): EnvelopeV1 {
  if (opts.recipients.length === 0) throw new Error("at least one recipient is required");
  const dek = randomBytes(32);
  const nonce = randomBytes(24);
  const ciphertext = xchacha20poly1305(dek, nonce, utf8ToBytes(opts.aad)).encrypt(opts.plaintext);
  const recipients = opts.recipients.map((recipient) => wrapDek(dek, recipient));
  return {
    v: 1,
    alg: ENVELOPE_ALG,
    aad: opts.aad,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
    recipients,
  };
}

export function decryptEnvelope(opts: {
  envelope: EnvelopeV1;
  account_id: string;
  secretKey: Uint8Array;
  expectedAad: string;
}): Uint8Array {
  assertEnvelope(opts.envelope);
  if (opts.envelope.aad !== opts.expectedAad) {
    throw new Error("AAD mismatch");
  }
  const dek = unwrapDek(opts.envelope, opts.account_id, opts.secretKey);
  try {
    return xchacha20poly1305(dek, base64ToBytes(opts.envelope.nonce), utf8ToBytes(opts.envelope.aad)).decrypt(
      base64ToBytes(opts.envelope.ciphertext),
    );
  } catch {
    throw new Error("ciphertext authentication failed");
  }
}

/** Unwrap the DEK and wrap that same DEK for a new recipient list. Ciphertext stays put. */
export function rewrapEnvelope(opts: {
  envelope: EnvelopeV1;
  account_id: string;
  secretKey: Uint8Array;
  recipients: RecipientKey[];
}): EnvelopeV1 {
  assertEnvelope(opts.envelope);
  if (opts.recipients.length === 0) throw new Error("at least one recipient is required");
  const dek = unwrapDek(opts.envelope, opts.account_id, opts.secretKey);
  return {
    ...opts.envelope,
    recipients: opts.recipients.map((recipient) => wrapDek(dek, recipient)),
  };
}

export function canonicalEnvelopeBytes(envelope: EnvelopeV1): Uint8Array {
  assertEnvelope(envelope);
  const recipients = [...envelope.recipients].sort((a, b) => a.account_id.localeCompare(b.account_id));
  const recipientJson = recipients
    .map(
      (recipient) =>
        `{"account_id":${JSON.stringify(recipient.account_id)},"epk":${JSON.stringify(recipient.epk)},"wrap_nonce":${JSON.stringify(recipient.wrap_nonce)},"wrapped_dek":${JSON.stringify(recipient.wrapped_dek)}}`,
    )
    .join(",");
  const json = `{"aad":${JSON.stringify(envelope.aad)},"alg":${JSON.stringify(envelope.alg)},"ciphertext":${JSON.stringify(envelope.ciphertext)},"nonce":${JSON.stringify(envelope.nonce)},"recipients":[${recipientJson}],"v":1}`;
  return utf8ToBytes(json);
}

export function cipherHash(envelope: EnvelopeV1): string {
  return bytesToHex(sha256(canonicalEnvelopeBytes(envelope)));
}

export function sectionAad(recordId: string, sectionKey: string): string {
  return `${recordId}|${sectionKey}|v1`;
}

function wrapDek(dek: Uint8Array, recipient: RecipientKey): RecipientWrap {
  if (recipient.publicKey.length !== 32) throw new Error("recipient public key must be 32 bytes");
  const ephemeralSecret = x25519.utils.randomSecretKey();
  const epk = x25519.getPublicKey(ephemeralSecret);
  const shared = x25519.getSharedSecret(ephemeralSecret, recipient.publicKey);
  const wrapKey = hkdf(sha256, shared, concat(epk, recipient.publicKey), WRAP_INFO, 32);
  const wrapNonce = randomBytes(24);
  const wrapped = xchacha20poly1305(wrapKey, wrapNonce).encrypt(dek);
  return {
    account_id: recipient.account_id,
    epk: bytesToBase64(epk),
    wrap_nonce: bytesToBase64(wrapNonce),
    wrapped_dek: bytesToBase64(wrapped),
  };
}

function unwrapDek(envelope: EnvelopeV1, accountId: string, secretKey: Uint8Array): Uint8Array {
  const entry = envelope.recipients.find((recipient) => recipient.account_id === accountId);
  if (!entry) throw new Error("recipient not on envelope");
  if (secretKey.length !== 32) throw new Error("X25519 secret key must be 32 bytes");
  const epk = base64ToBytes(entry.epk);
  const recipientPk = x25519.getPublicKey(secretKey);
  const shared = x25519.getSharedSecret(secretKey, epk);
  const wrapKey = hkdf(sha256, shared, concat(epk, recipientPk), WRAP_INFO, 32);
  try {
    return xchacha20poly1305(wrapKey, base64ToBytes(entry.wrap_nonce)).decrypt(base64ToBytes(entry.wrapped_dek));
  } catch {
    throw new Error("wrap authentication failed");
  }
}

function assertEnvelope(envelope: EnvelopeV1): void {
  if (envelope.v !== 1 || envelope.alg !== ENVELOPE_ALG) throw new Error("unsupported envelope");
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
