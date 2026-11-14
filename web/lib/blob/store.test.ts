import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { BLOB_MAX_BYTES, getBlob, putBlob, sha256Hex } from "./store.ts";
import { contentLengthOverLimit, readBodyAtMost } from "./body.ts";

test("blobs are content-addressed ciphertext bytes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "rr-blob-"));
  try {
    const body = new TextEncoder().encode('{"v":1,"ciphertext":"aabb"}');
    const hash = await putBlob(body, directory);
    assert.equal(hash, sha256Hex(body));
    const again = await putBlob(body, directory);
    assert.equal(again, hash);
    const stored = await getBlob(hash, directory);
    assert.equal(Buffer.compare(Buffer.from(stored ?? []), body), 0);
    assert.equal(await getBlob("ab".repeat(32), directory), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("M3 an oversized body is refused before it is kept", async () => {
  assert.equal(contentLengthOverLimit(String(BLOB_MAX_BYTES + 1)), true);
  assert.equal(contentLengthOverLimit(String(BLOB_MAX_BYTES)), false);
  assert.equal(contentLengthOverLimit(null), false);
  const chunk = new Uint8Array(400_000);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk);
      controller.enqueue(chunk);
      controller.enqueue(chunk);
      controller.close();
    },
  });
  assert.equal(await readBodyAtMost(stream), null);
  const small = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([4, 5, 6]));
      controller.close();
    },
  });
  const read = await readBodyAtMost(small);
  assert.deepEqual([...(read ?? [])], [4, 5, 6]);
});

test("ciphertext written in one directory is absent from another", async () => {
  const left = await mkdtemp(path.join(tmpdir(), "rr-blob-a-"));
  const right = await mkdtemp(path.join(tmpdir(), "rr-blob-b-"));
  try {
    const body = new TextEncoder().encode(`cipher-only-${Date.now()}-${Math.random()}`);
    const hash = sha256Hex(body);
    await writeFile(path.join(left, hash), body);
    assert.equal(await getBlob(hash, right), null);
    const found = await getBlob(hash, left);
    assert.equal(Buffer.compare(Buffer.from(found ?? []), body), 0);
  } finally {
    await rm(left, { recursive: true, force: true });
    await rm(right, { recursive: true, force: true });
  }
});

test("M3 a failed blob write is not cached", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "rr-blob-"));
  try {
    const blocker = path.join(directory, "not-a-directory");
    await writeFile(blocker, "x");
    const body = new TextEncoder().encode(`no-cache-${Date.now()}-${Math.random()}`);
    await assert.rejects(() => putBlob(body, blocker));
    assert.equal(await getBlob(sha256Hex(body), directory), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
