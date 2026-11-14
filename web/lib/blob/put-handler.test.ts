import assert from "node:assert/strict";
import { test } from "node:test";
import { dayUsage, memoryStore } from "../guard/visitor.ts";
import { newVisitorSession, writeVisitorCookie } from "../session/visitor.ts";
import { BLOB_MAX_BYTES } from "./store.ts";
import { handleBlobPut } from "./put-handler.ts";

const SECRET = "test-session-secret";
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);

function cookie(): string {
  return writeVisitorCookie(newVisitorSession(NOW), SECRET, false).split(";")[0] ?? "";
}

function put(body: BodyInit | null, headers: Headers, duplex?: "half"): Request {
  return new Request("https://demo.test/api/blob", { method: "PUT", headers, body, duplex });
}

test("unauthenticated and oversized blob puts do not consume the daily budget", async () => {
  const store = memoryStore({ isolated: true });
  let writes = 0;
  const deps = {
    now: NOW,
    store,
    secret: SECRET,
    put: async () => {
      writes += 1;
      return "ab".repeat(32);
    },
  };
  const anonymous = await handleBlobPut(put(new Uint8Array([1, 2, 3]), new Headers()), deps);
  assert.equal(anonymous.status, 401);
  const headers = new Headers({ cookie: cookie(), "content-length": String(BLOB_MAX_BYTES + 1) });
  const oversized = await handleBlobPut(put(new Uint8Array([1]), headers), deps);
  assert.equal(oversized.status, 413);
  const emptyHeaders = new Headers({ cookie: cookie() });
  const empty = await handleBlobPut(put(new Uint8Array(), emptyHeaders), deps);
  assert.equal(empty.status, 400);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(BLOB_MAX_BYTES));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  const streamed = await handleBlobPut(put(stream, new Headers({ cookie: cookie() }), "half"), deps);
  assert.equal(streamed.status, 413);
  assert.equal(writes, 0);
  assert.equal(await dayUsage("sign", NOW, store), 0);
});

test("a blob put rejects a foreign origin and accepts the demo origin", async () => {
  const store = memoryStore({ isolated: true });
  let writes = 0;
  const deps = {
    now: NOW,
    store,
    secret: SECRET,
    put: async () => {
      writes += 1;
      return "ab".repeat(32);
    },
  };
  const foreign = await handleBlobPut(
    put(new Uint8Array([1, 2, 3]), new Headers({ cookie: cookie(), origin: "https://evil.example" })),
    deps,
  );
  assert.equal(foreign.status, 403);
  const same = await handleBlobPut(
    put(new Uint8Array([1, 2, 3]), new Headers({ cookie: cookie(), origin: "https://demo.test" })),
    deps,
  );
  assert.equal(same.status, 201);
  assert.equal(writes, 1);
});

test("a valid blob put consumes one daily budget unit", async () => {
  const store = memoryStore({ isolated: true });
  let writes = 0;
  const deps = {
    now: NOW,
    store,
    secret: SECRET,
    put: async (bytes: Uint8Array) => {
      writes += 1;
      assert.equal(bytes.byteLength, 3);
      return "cd".repeat(32);
    },
  };
  const headers = new Headers({ cookie: cookie() });
  const response = await handleBlobPut(put(new Uint8Array([7, 8, 9]), headers), deps);
  const body = (await response.json()) as { hash?: string };
  assert.equal(response.status, 201);
  assert.equal(body.hash, "cd".repeat(32));
  assert.equal(writes, 1);
  assert.equal(await dayUsage("sign", NOW, store), 1);
  const anonymous = await handleBlobPut(put(new Uint8Array([1]), new Headers()), deps);
  assert.equal(anonymous.status, 401);
  assert.equal(writes, 1);
  assert.equal(await dayUsage("sign", NOW, store), 1);
});
