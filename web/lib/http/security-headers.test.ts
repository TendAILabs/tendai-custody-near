import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CROSS_ORIGIN_OPENER_POLICY, permissionsPolicy } from "./security-headers.ts";

test("permissions policy denies sensors and keeps clipboard write", () => {
  const policy = permissionsPolicy();
  for (const feature of ["camera", "microphone", "geolocation", "payment", "usb", "bluetooth", "serial", "hid"]) {
    assert.match(policy, new RegExp(`(?:^|, )${feature}=\\(\\)(?:,|$)`));
    assert.equal(policy.includes(`${feature}=(self)`), false);
  }
  assert.match(policy, /clipboard-write=\(self\)/);
  assert.equal(policy.includes("clipboard-write=()"), false);
});

test("COOP keeps wallet popups and the CSP helper is still the policy source", () => {
  assert.equal(CROSS_ORIGIN_OPENER_POLICY, "same-origin-allow-popups");
  const source = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");
  assert.match(source, /contentSecurityPolicy\(process\.env\.VERCEL_ENV\)/);
  assert.match(source, /Permissions-Policy/);
  assert.match(source, /Cross-Origin-Opener-Policy/);
  assert.match(source, /permissionsPolicy\(\)/);
  assert.match(source, /CROSS_ORIGIN_OPENER_POLICY/);
  assert.equal(source.includes("tendaicustody.app"), false);
});
