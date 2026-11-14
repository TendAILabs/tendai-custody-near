import { BLOB_MAX_BYTES, isSha256Hex, sha256Hex } from "../blob/store.ts";

export type PresentedEnvelope = {
  hash?: string;
  body_base64?: string;
};

const MAX_PRESENTED = 8;

function decodeBounded(value: string): Uint8Array | null {
  const limit = Math.ceil(BLOB_MAX_BYTES / 3) * 4 + 4;
  if (value.length === 0 || value.length > limit) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > BLOB_MAX_BYTES) return null;
  return bytes;
}

/** Ciphertext the caller still holds. Used only when the bytes hash to the on-chain id. */
export function presentedBytes(hash: string, envelopes: PresentedEnvelope[] | undefined): Uint8Array | null {
  if (!isSha256Hex(hash) || !Array.isArray(envelopes)) return null;
  for (const item of envelopes.slice(0, MAX_PRESENTED)) {
    if (!item || item.hash !== hash || typeof item.body_base64 !== "string") continue;
    const bytes = decodeBounded(item.body_base64);
    if (!bytes || sha256Hex(bytes) !== hash) continue;
    return bytes;
  }
  return null;
}
