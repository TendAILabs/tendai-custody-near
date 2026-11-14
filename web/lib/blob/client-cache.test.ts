import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { bytesToBase64, recallCiphertext, rememberCiphertext } from "./client-cache.ts";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.get(key) ?? null;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(key, value);
    },
  };
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("the browser cache keeps ciphertext only when the hash matches", () => {
  const storage = memoryStorage();
  const bytes = new TextEncoder().encode("ciphertext-envelope-v1");
  const id = hash(bytes);
  assert.equal(rememberCiphertext(id, bytesToBase64(bytes), storage), true);
  assert.equal(recallCiphertext(id, storage), bytesToBase64(bytes));
  assert.equal(rememberCiphertext(id, bytesToBase64(new TextEncoder().encode("nope")), storage), false);
  assert.equal(recallCiphertext(id, storage), bytesToBase64(bytes));
  const saved = storage.getItem("rr-ciphertext") ?? "";
  assert.equal(saved.includes("Maya"), false);
  assert.equal(saved.includes("plaintext"), false);
});

test("the browser cache keeps the last 8 ciphertext copies", () => {
  const storage = memoryStorage();
  const hashes: string[] = [];
  for (let i = 0; i < 9; i += 1) {
    const bytes = new TextEncoder().encode(`cipher-${i}`);
    const id = hash(bytes);
    hashes.push(id);
    assert.equal(rememberCiphertext(id, bytesToBase64(bytes), storage), true);
  }
  assert.equal(recallCiphertext(hashes[0], storage), null);
  assert.ok(recallCiphertext(hashes[8], storage));
});
