import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ERROR_EXPLANATIONS, explainError } from "./errors.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

function walk(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, suffix));
    else if (name.endsWith(suffix)) out.push(full);
  }
  return out;
}

function codesIn(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/ERR_[A-Z0-9_]+/g)].map((match) => match[0]);
}

const mapped = new Map(ERROR_EXPLANATIONS.map((entry) => [entry.code, entry]));

test("every contract and API ERR code has a sentence and a next step", () => {
  const files = [...walk(path.join(repo, "contract/src"), ".rs"), ...walk(path.join(repo, "web/app/api"), ".ts")];
  assert.ok(files.some((file) => file.endsWith("lib.rs")));
  assert.ok(files.some((file) => file.endsWith("route.ts")));
  const found = new Set(files.flatMap(codesIn));
  assert.ok(found.size >= 15, `expected the contract to return many ERR codes, found ${found.size}`);
  for (const code of found) {
    const entry = mapped.get(code);
    assert.ok(entry, `missing explanation for ${code}`);
    assert.equal(entry.code, code);
    assert.ok(entry.sentence.length > 20);
    assert.ok(entry.next.length > 20);
    assert.equal(explainError(code).code, code);
    assert.equal(explainError(`Smart contract panicked: ${code}`).sentence, entry.sentence);
  }
});

test("429 and signer not configured map to a plain sentence and a next step", () => {
  for (const input of [429, "429", "rate limit", { status: 429, error: "rate limit" }, { status: 429 }]) {
    const explained = explainError(input);
    assert.equal(explained.code, "429");
    assert.match(explained.sentence, /limiting calls/i);
    assert.match(explained.next, /Wait/);
  }
  for (const input of ["signer not configured", "Signer not configured", new Error("signer not configured")]) {
    const explained = explainError(input);
    assert.equal(explained.code, "signer not configured");
    assert.match(explained.sentence, /no signing key/i);
    assert.match(explained.next, /Start here/);
  }
  const signRoute = readFileSync(path.join(repo, "web/lib/near/sign-handler.ts"), "utf8");
  assert.match(signRoute, /signer not configured/);
  assert.match(signRoute, /status: 429|429/);
});

test("explanations stay plain and do not echo unknown input", () => {
  const leaked = explainError("token sk-live /tmp/secret HIPAA compliant audited certified vulnerability-free");
  assert.equal(leaked.code, "unknown");
  assert.equal(leaked.sentence, "This step failed.");
  assert.doesNotMatch(`${leaked.sentence} ${leaked.next}`, /sk-live|\/tmp|HIPAA compliant|audited|certified|vulnerability-free/i);
  for (const entry of ERROR_EXPLANATIONS) {
    const text = `${entry.code} ${entry.sentence} ${entry.next}`;
    assert.equal(text.includes("—"), false, entry.code);
    assert.doesNotMatch(text, /HIPAA compliant|audited|certified|vulnerability-free|protection on/i);
  }
});
