import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { actorPublicHex } from "../crypto/actor-key.ts";
import { METHOD_ROLES, type SignRole } from "./sign-allow.ts";

const kit = new URL("../../../deploy-kit/", import.meta.url);

function kitText(name: string): string {
  return readFileSync(new URL(name, kit), "utf8");
}

function methodsFor(role: SignRole): string {
  return Object.entries(METHOD_ROLES)
    .filter(([, roles]) => (roles as readonly string[]).includes(role))
    .map(([method]) => method)
    .join(",");
}

test("kit method lists match the sign allow list", () => {
  const provision = kitText("provision.sh");
  const block = provision.split("# KIT_METHODS_BEGIN")[1]?.split("# KIT_METHODS_END")[0] ?? "";
  for (const role of ["clinic", "hospital", "second", "app", "patient"] as const) {
    const match = block.match(new RegExp(`${role}\\) printf '%s' '([^']*)'`));
    assert.ok(match, role);
    assert.equal(match[1], methodsFor(role));
  }
  assert.match(provision, /add_function_key lakeside "\$LAKESIDE_ID" clinic/);
  assert.match(provision, /fund-later use-auto-generation save-to-folder/);
  assert.equal(/\b(near|run_near)\s+generate-keypair\b/.test(provision), false);
});

test("vercel env script overwrites with add --force and does not remove", () => {
  const vercel = kitText("vercel-env.sh");
  assert.match(vercel, /env add "\$name" --environment "\$env_name"/);
  assert.match(vercel, /--force/);
  assert.match(vercel, /--non-interactive <"\$value_file"/);
  assert.equal(/vercel env remove\b/.test(vercel), false);
});

test("kit encryption public keys match actor-key vectors", async () => {
  const kitModule = await import("../../../deploy-kit/enc-public.mjs");
  const seed = "ab".repeat(32);
  for (const account of ["patient.test", "clinic.testnet", "rr-pulsefit.testnet"]) {
    assert.equal(kitModule.actorPublicHex(seed, account), actorPublicHex(seed, account));
  }
});

test("deploy script pins the committed wasm and does not call cargo", () => {
  const deploy = kitText("deploy.sh");
  const expected = "67b2ec90989a2f6b6afbebb1b77061b479c65f787943f82ac0cd61ab478e5d3b";
  assert.match(deploy, new RegExp(expected));
  assert.equal(deploy.includes("cargo"), false);
  const wasm = readFileSync(new URL("referral_relay.wasm", kit));
  assert.equal(createHash("sha256").update(wasm).digest("hex"), expected);
});
