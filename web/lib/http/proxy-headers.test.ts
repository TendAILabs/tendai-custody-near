import assert from "node:assert/strict";
import { test } from "node:test";
import { upstreamRequestHeaders, upstreamResponseHeaders } from "./proxy-headers.ts";

test("L2 upstream requests keep an allowlist and drop caller secrets", () => {
  const incoming = new Headers();
  incoming.set("content-type", "application/json");
  incoming.set("accept", "application/json");
  incoming.set("x-encryption-version", "3");
  incoming.set("x-model-pub-key", "model-key");
  incoming.set("x-client-pub-key", "client-key");
  incoming.set("x-signing-algo", "ed25519");
  incoming.set("x-no-aliasing", "true");
  incoming.set("x-encrypt-all-fields", "true");
  incoming.set("authorization", "Bearer caller-secret");
  incoming.set("cookie", "rr_visitor=secret");
  incoming.set("x-vercel-protection-bypass", "bypass-value");
  incoming.set("x-vercel-set-bypass-cookie", "1");
  incoming.set("x-rr-selftest", "selftest-value");
  incoming.set("x-forwarded-for", "203.0.113.8");
  incoming.set("x-forwarded-host", "evil.example");
  incoming.set("x-forwarded-proto", "https");
  incoming.set("x-api-key", "caller-key");
  const headers = upstreamRequestHeaders(incoming, "Bearer server-key");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.get("x-encryption-version"), "3");
  assert.equal(headers.get("x-model-pub-key"), "model-key");
  assert.equal(headers.get("x-client-pub-key"), "client-key");
  assert.equal(headers.get("x-signing-algo"), "ed25519");
  assert.equal(headers.get("x-no-aliasing"), "true");
  assert.equal(headers.get("x-encrypt-all-fields"), "true");
  assert.equal(headers.get("authorization"), "Bearer server-key");
  assert.equal(headers.get("accept-encoding"), "identity");
  for (const name of [
    "cookie",
    "x-vercel-protection-bypass",
    "x-vercel-set-bypass-cookie",
    "x-rr-selftest",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-api-key",
  ]) {
    assert.equal(headers.get(name), null, name);
  }
  const flat = [...headers.entries()].map(([key, value]) => `${key}:${value}`).join("\n");
  assert.equal(flat.includes("caller-secret"), false);
  assert.equal(flat.includes("bypass-value"), false);
  assert.equal(flat.includes("selftest-value"), false);
  assert.equal(flat.includes("203.0.113.8"), false);
  assert.equal(flat.includes("caller-key"), false);
  assert.equal(flat.includes("rr_visitor"), false);
});

test("L2 upstream responses drop set-cookie", () => {
  const incoming = new Headers();
  incoming.set("content-type", "application/json");
  incoming.append("set-cookie", "session=upstream; HttpOnly");
  incoming.append("set-cookie", "other=value");
  const headers = upstreamResponseHeaders(incoming);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("set-cookie"), null);
  assert.equal([...headers.keys()].includes("set-cookie"), false);
  const flat = [...headers.entries()].map(([key, value]) => `${key}:${value}`).join("\n");
  assert.equal(flat.includes("upstream"), false);
  assert.equal(flat.includes("other=value"), false);
});
