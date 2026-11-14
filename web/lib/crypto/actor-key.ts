import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { x25519KeyPairFromSecret, type X25519KeyPair } from "./envelope.ts";

const INFO = utf8ToBytes("referral-relay/v1/actor");

export function actorKeyPair(seedHex: string, accountId: string): X25519KeyPair {
  if (!/^[0-9a-f]{64}$/i.test(seedHex)) throw new Error("DEMO_ENC_SEED must be 32 bytes hex");
  const secret = hkdf(sha256, hexToBytes(seedHex), utf8ToBytes(accountId), INFO, 32);
  return x25519KeyPairFromSecret(secret);
}

export function actorPublicHex(seedHex: string, accountId: string): string {
  const { publicKey } = actorKeyPair(seedHex, accountId);
  return [...publicKey].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
