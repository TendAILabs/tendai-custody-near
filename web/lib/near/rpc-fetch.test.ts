import assert from "node:assert/strict";
import test from "node:test";
import { rpcPost } from "./rpc-fetch.ts";
import { isTransportError } from "./provider.ts";

function reply(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

test("a throttled provider hands over to the next one", async () => {
  const seen: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    seen.push(String(url));
    return seen.length === 1 ? reply(429, "slow down") : reply(200, { jsonrpc: "2.0", result: { ok: true } });
  }) as typeof fetch;
  try {
    const out = await rpcPost({ jsonrpc: "2.0", id: "t", method: "status", params: [] });
    assert.equal(out.status, 200);
    assert.deepEqual(out.payload.result, { ok: true });
    assert.equal(new Set(seen).size, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("a contract error in a good response is returned and not retried on another node", async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return reply(200, { jsonrpc: "2.0", result: { error: "ERR_REVOKED" } });
  }) as typeof fetch;
  try {
    const out = await rpcPost({ jsonrpc: "2.0", id: "t", method: "query", params: {} });
    assert.equal((out.payload.result as { error: string }).error, "ERR_REVOKED");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("only transport errors fail over for near-api-js calls", () => {
  assert.equal(isTransportError(Object.assign(new Error("Bad Gateway"), { cause: 502 })), true);
  assert.equal(isTransportError(Object.assign(new Error("x"), { type: "RetriesExceeded" })), true);
  assert.equal(isTransportError(new TypeError("fetch failed")), true);
  assert.equal(isTransportError(new Error("ERR_ALREADY_REGISTERED")), false);
  assert.equal(isTransportError(Object.assign(new Error("InvalidNonce"), { type: "InvalidNonce" })), false);
});
