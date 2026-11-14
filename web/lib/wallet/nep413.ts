import { sha256 } from "@noble/hashes/sha2.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { KeyPair } from "near-api-js";

const NEP413_PREFIX = 2147484061;
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function borshString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, true);
  out.set(bytes, 4);
  return out;
}

export function nep413Digest(message: string, nonce: Uint8Array, recipient: string): Uint8Array {
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, NEP413_PREFIX, true);
  const parts = [prefix, borshString(message), nonce, borshString(recipient), new Uint8Array([0])];
  const payload = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    payload.set(part, offset);
    offset += part.length;
  }
  return sha256(payload);
}

function base58Encode(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += (digits[index] ?? 0) * 256;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let zeros = 0;
  for (const byte of bytes) {
    if (byte !== 0) break;
    zeros += 1;
  }
  return `${"1".repeat(zeros)}${digits
    .reverse()
    .map((digit) => ALPHABET[digit] ?? "")
    .join("")}`;
}

export function implicitPublicKey(publicKeyHex: string): string {
  return `ed25519:${base58Encode(Buffer.from(publicKeyHex, "hex"))}`;
}

export function signLocalNep413(secret: string, input: { message: string; nonce: Uint8Array; recipient: string }): string {
  const pair = KeyPair.fromString(secret as `ed25519:${string}`);
  const signed = pair.sign(nep413Digest(input.message, input.nonce, input.recipient));
  let binary = "";
  for (const byte of signed.signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function verifyLocalNep413(
  publicKeyHex: string,
  signatureB64: string,
  input: { message: string; nonce: Uint8Array; recipient: string },
): boolean {
  try {
    const signature = Buffer.from(signatureB64, "base64");
    if (signature.length !== 64 || input.nonce.length !== 32 || !/^[0-9a-f]{64}$/i.test(publicKeyHex)) return false;
    return ed25519.verify(signature, nep413Digest(input.message, input.nonce, input.recipient), Buffer.from(publicKeyHex, "hex"));
  } catch {
    return false;
  }
}
