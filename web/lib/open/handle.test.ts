import assert from "node:assert/strict";
import { test } from "node:test";
import { sha256Hex } from "../blob/store.ts";
import { COPY_UNAVAILABLE, COPY_UNAVAILABLE_MESSAGE } from "./copy.ts";
import { domainTag } from "../session/domain.ts";
import { handleOpen, openNonceKey, redisNonceStore, resetUsedNonces, type NonceRedis } from "./handle.ts";

const nonce = "11".repeat(32);
const blob = new TextEncoder().encode("ciphertext-envelope");

function deps(status: string | null, ticket: boolean) {
  return {
    checkTicket: async () => ticket,
    effectiveStatus: async () => status,
    blobHashes: async () => ["ab".repeat(32)],
    readBlob: async () => blob,
  };
}

test("no ticket gives 403", async () => {
  resetUsedNonces();
  const response = await handleOpen(
    { account_id: "hospital.testnet", nonce, share_id: "1" },
    deps("Active", false),
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "no-ticket");
});

test("RR-08 concurrent opens of one nonce allow a single 200", async () => {
  resetUsedNonces();
  const nonce = "22".repeat(32);
  const body = { account_id: "hospital.testnet", nonce, share_id: "9" };
  const responses = await Promise.all([handleOpen(body, deps("Active", true)), handleOpen(body, deps("Active", true)), handleOpen(body, deps("Active", true))]);
  const statuses = [];
  for (const response of responses) statuses.push(response.status);
  assert.equal(statuses.filter((status) => status === 200).length, 1);
  assert.equal(statuses.filter((status) => status === 403).length, 2);
});

test("replayed nonce gives 403", async () => {
  resetUsedNonces();
  const first = await handleOpen(
    { account_id: "hospital.testnet", nonce, share_id: "2" },
    deps("Active", true),
  );
  assert.equal(first.status, 200);
  const second = await handleOpen(
    { account_id: "hospital.testnet", nonce, share_id: "2" },
    deps("Active", true),
  );
  assert.equal(second.status, 403);
  assert.equal((await second.json()).error, "replay");
});

test("a still-fresh ticket is refused once the share is revoked", async () => {
  resetUsedNonces();
  const response = await handleOpen(
    { account_id: "hospital.testnet", nonce, share_id: "4" },
    deps("Revoked", true),
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "revoked");
});

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function openDeps(hash: string, ticket = true) {
  return {
    checkTicket: async () => ticket,
    effectiveStatus: async () => "Active" as string | null,
    blobHashes: async () => [hash],
    readBlob: async () => null as Uint8Array | null,
  };
}

test("another instance opens when the presented ciphertext matches the chain", async () => {
  resetUsedNonces();
  const bytes = new TextEncoder().encode("ciphertext-only-envelope");
  const hash = sha256Hex(bytes);
  const response = await handleOpen(
    {
      account_id: "pulsefit.testnet",
      nonce: "33".repeat(32),
      share_id: "20",
      envelopes: [{ hash, body_base64: b64(bytes) }],
    },
    openDeps(hash),
  );
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { envelopes: { hash: string; body_base64: string }[] };
  assert.equal(payload.envelopes[0]?.hash, hash);
  assert.equal(payload.envelopes[0]?.body_base64, b64(bytes));
});

test("presented ciphertext for a different hash is not released", async () => {
  resetUsedNonces();
  const bytes = new TextEncoder().encode("other-ciphertext");
  const response = await handleOpen(
    {
      account_id: "hospital.testnet",
      nonce: "44".repeat(32),
      share_id: "21",
      envelopes: [{ hash: sha256Hex(bytes), body_base64: b64(bytes) }],
    },
    openDeps("ab".repeat(32)),
  );
  assert.equal(response.status, 404);
  const payload = (await response.json()) as { error: string; message: string };
  assert.equal(payload.error, COPY_UNAVAILABLE);
  assert.equal(payload.message, COPY_UNAVAILABLE_MESSAGE);
  assert.equal(JSON.stringify(payload).includes("other-ciphertext"), false);
  assert.doesNotMatch(payload.message, /blob|\/tmp|HIPAA compliant|audited|vulnerability-free/i);
});

test("a presented body whose sha256 does not match its hash is ignored", async () => {
  resetUsedNonces();
  const real = new TextEncoder().encode("real-ciphertext");
  const fake = new TextEncoder().encode("fake-ciphertext");
  const hash = sha256Hex(real);
  const response = await handleOpen(
    {
      account_id: "hospital.testnet",
      nonce: "55".repeat(32),
      share_id: "22",
      envelopes: [{ hash, body_base64: b64(fake) }],
    },
    openDeps(hash),
  );
  assert.equal(response.status, 404);
  assert.equal(((await response.json()) as { error: string }).error, COPY_UNAVAILABLE);
});

test("a missing copy does not burn the nonce", async () => {
  resetUsedNonces();
  const nonce = "66".repeat(32);
  const bytes = new TextEncoder().encode("later-ciphertext");
  const hash = sha256Hex(bytes);
  const deps = openDeps(hash);
  const first = await handleOpen({ account_id: "app.testnet", nonce, share_id: "23" }, deps);
  assert.equal(first.status, 404);
  const second = await handleOpen(
    { account_id: "app.testnet", nonce, share_id: "23", envelopes: [{ hash, body_base64: b64(bytes) }] },
    deps,
  );
  assert.equal(second.status, 200);
});

test("no ticket does not release presented ciphertext", async () => {
  resetUsedNonces();
  const bytes = new TextEncoder().encode("secret-ciphertext-bytes");
  const hash = sha256Hex(bytes);
  const encoded = b64(bytes);
  const response = await handleOpen(
    {
      account_id: "app.testnet",
      nonce: "77".repeat(32),
      share_id: "24",
      envelopes: [{ hash, body_base64: encoded }],
    },
    openDeps(hash, false),
  );
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(JSON.stringify(payload).includes(encoded.slice(0, 12)), false);
});

test("an oversized presented body is ignored", async () => {
  resetUsedNonces();
  const hash = "cd".repeat(32);
  const response = await handleOpen(
    {
      account_id: "app.testnet",
      nonce: "88".repeat(32),
      share_id: "25",
      envelopes: [{ hash, body_base64: "A".repeat(2_000_000) }],
    },
    openDeps(hash),
  );
  assert.equal(response.status, 404);
  assert.equal(((await response.json()) as { error: string }).error, COPY_UNAVAILABLE);
});

test("a configured redis claims a nonce with SET NX EX 120 and an env prefix", async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  const seen = new Set<string>();
  const ops: { op: string; key: string; ex?: number; nx?: boolean }[] = [];
  const redis: NonceRedis = {
    async set(key, _value, opts) {
      ops.push({ op: "set", key, ex: opts.ex, nx: opts.nx });
      if (seen.has(key)) return null;
      seen.add(key);
      return "OK";
    },
    async del(key) {
      ops.push({ op: "del", key });
      seen.delete(key);
      return 1;
    },
  };
  try {
    const nonces = redisNonceStore(redis);
    const body = { account_id: "hospital.testnet", nonce: "99".repeat(32), share_id: "30" };
    const first = await handleOpen(body, { ...deps("Active", true), nonces });
    assert.equal(first.status, 200);
    assert.equal(ops[0]?.op, "set");
    assert.equal(ops[0]?.nx, true);
    assert.equal(ops[0]?.ex, 120);
    const noncePrefix = `preview:open:nonce:${domainTag()}:`;
    assert.equal(ops[0]?.key.startsWith(noncePrefix), true);
    assert.equal(ops[0]?.key, openNonceKey(ops[0]?.key.slice(noncePrefix.length) ?? ""));
    const second = await handleOpen(body, { ...deps("Active", true), nonces });
    assert.equal(second.status, 403);
    assert.equal((await second.json()).error, "replay");
    assert.equal(ops.filter((op) => op.op === "del").length, 0);
    const missing = await handleOpen(
      { account_id: "app.testnet", nonce: "ab".repeat(32), share_id: "31" },
      { ...openDeps("cd".repeat(32)), nonces },
    );
    assert.equal(missing.status, 404);
    assert.equal(ops.filter((op) => op.op === "del").length, 1);
    const retry = await handleOpen(
      { account_id: "app.testnet", nonce: "ab".repeat(32), share_id: "31" },
      { ...openDeps("cd".repeat(32), true), nonces },
    );
    assert.equal(retry.status, 404);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test("redis is skipped when it is not configured", async () => {
  const previousUrl = process.env.KV_REST_API_URL;
  const previousToken = process.env.KV_REST_API_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  try {
    resetUsedNonces();
    const nonce = "bc".repeat(32);
    const first = await handleOpen({ account_id: "hospital.testnet", nonce, share_id: "32" }, deps("Active", true));
    const second = await handleOpen({ account_id: "hospital.testnet", nonce, share_id: "32" }, deps("Active", true));
    assert.equal(first.status, 200);
    assert.equal(second.status, 403);
  } finally {
    if (previousUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previousUrl;
    if (previousToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previousToken;
  }
});

test("a non canonical id is rejected before the nonce is used", async () => {
  resetUsedNonces();
  const nonce = "ad".repeat(32);
  for (const share_id of ["01", "001", " 1", "+1", "1e0", "0x1", "18446744073709551616"]) {
    const response = await handleOpen({ account_id: "hospital.testnet", nonce, share_id }, deps("Active", true));
    assert.equal(response.status, 400, share_id);
    assert.equal((await response.json()).error, "bad request");
  }
  const zero = await handleOpen({ account_id: "hospital.testnet", nonce: "ae".repeat(32), share_id: "0" }, deps("Active", true));
  const max = await handleOpen(
    { account_id: "hospital.testnet", nonce: "af".repeat(32), share_id: "18446744073709551615" },
    deps("Active", true),
  );
  assert.equal(zero.status, 200);
  assert.equal(max.status, 200);
  const again = await handleOpen({ account_id: "hospital.testnet", nonce, share_id: "1" }, deps("Active", true));
  assert.equal(again.status, 200);
});

test("share 01 cannot open again after share 1 used the same nonce", async () => {
  resetUsedNonces();
  const seen: string[] = [];
  const gate = {
    checkTicket: async ({ id }: { id: string }) => {
      seen.push(id);
      return true;
    },
    effectiveStatus: async () => "Active" as string | null,
    blobHashes: async ({ id }: { id: string }) => {
      seen.push(id);
      return ["ab".repeat(32)];
    },
    readBlob: async () => blob,
  };
  const nonce = "de".repeat(32);
  const first = await handleOpen({ account_id: "hospital.testnet", nonce, share_id: "1" }, gate);
  assert.equal(first.status, 200);
  const alias = await handleOpen({ account_id: "hospital.testnet", nonce, share_id: "01" }, gate);
  assert.equal(alias.status, 400);
  assert.equal((await alias.json()).error, "bad request");
  const again = await handleOpen({ account_id: "hospital.testnet", nonce, share_id: "1" }, gate);
  assert.equal(again.status, 403);
  assert.equal((await again.json()).error, "replay");
  assert.deepEqual(seen, ["1", "1"]);
});

test("revoked gives 403", async () => {
  resetUsedNonces();
  const response = await handleOpen(
    { account_id: "hospital.testnet", nonce, share_id: "3" },
    deps("Revoked", false),
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "revoked");
});

test("null and numeric open fields are a 400, not a throw", async () => {
  resetUsedNonces();
  const base = deps("Active", true);
  for (const body of [
    null,
    { account_id: null, nonce: "aa".repeat(32), share_id: "1" },
    { account_id: 12, nonce: "aa".repeat(32), share_id: "1" },
    { account_id: "hospital.testnet", nonce: 12, share_id: "1" },
    { account_id: "hospital.testnet", nonce: "aa".repeat(32), share_id: 4 },
  ]) {
    const response = await handleOpen(body as never, base);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "bad request");
  }
});
