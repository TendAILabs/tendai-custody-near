import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { contentSecurityPolicy } from "./csp.ts";

test("production CSP does not name vercel.live", () => {
  for (const env of ["production", undefined, ""]) {
    assert.equal(contentSecurityPolicy(env).includes("vercel.live"), false, String(env));
  }
});

test("preview and development CSP allow the toolbar host", () => {
  for (const env of ["preview", "development"]) {
    assert.equal(contentSecurityPolicy(env).includes("https://vercel.live"), true, env);
  }
});

test("responses send a two-year HSTS policy", () => {
  const source = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");
  assert.match(source, /Strict-Transport-Security/);
  assert.match(source, /max-age=63072000; includeSubDomains/);
});
