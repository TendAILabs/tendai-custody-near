import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const KEY = "rr-ciphertext";
const MAX_ENTRIES = 8;

type Entry = { hash: string; body: string };

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  try {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function storageOrNull(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

function readAll(storage: Storage): Entry[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const entries: Entry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const hash = (item as { hash?: unknown }).hash;
      const body = (item as { body?: unknown }).body;
      if (typeof hash !== "string" || typeof body !== "string") continue;
      entries.push({ hash, body });
    }
    return entries;
  } catch {
    return [];
  }
}

function hashMatches(hash: string, body: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(hash)) return false;
  const bytes = decodeBase64(body);
  if (!bytes || bytes.byteLength === 0) return false;
  return bytesToHex(sha256(bytes)) === hash;
}

/** Keep ciphertext the browser sealed, keyed by its sha256. Plaintext is not stored here. */
export function rememberCiphertext(hash: string, bodyBase64: string, storage?: Storage): boolean {
  const target = storageOrNull(storage);
  if (!target || !hashMatches(hash, bodyBase64)) return false;
  const entries = readAll(target).filter((item) => item.hash !== hash);
  entries.push({ hash, body: bodyBase64 });
  const kept = entries.slice(-MAX_ENTRIES);
  try {
    target.setItem(KEY, JSON.stringify(kept));
    return true;
  } catch {
    return false;
  }
}

export function recallCiphertext(hash: string, storage?: Storage): string | null {
  const target = storageOrNull(storage);
  if (!target || !/^[0-9a-f]{64}$/.test(hash)) return null;
  const found = readAll(target).find((item) => item.hash === hash);
  if (!found || !hashMatches(hash, found.body)) return null;
  return found.body;
}
