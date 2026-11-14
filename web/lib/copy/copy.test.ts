import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FAQ, FAQ_ROLES } from "./faq.ts";
import { GLOSSARY, GLOSSARY_IDS, isGlossaryId } from "./glossary.ts";
import { DEMO, HIPAA_LINE, REAL } from "./limits.ts";
import { WALKTHROUGH } from "./walkthrough.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const pages = [
  "../../app/help/page.tsx",
  "../../app/support/page.tsx",
  "../../app/privacy/page.tsx",
  "../../app/terms/page.tsx",
  "../../app/start/page.tsx",
  "../../app/glossary/page.tsx",
  "../../components/wireframe/tip.tsx",
].map((file) => path.join(here, file));

const copyFiles = ["faq.ts", "glossary.ts", "limits.ts", "walkthrough.ts", "errors.ts", "index.ts"].map((file) => path.join(here, file));

function tokens(text: string): string[] {
  return [...text.matchAll(/\{([a-z0-9_]+)\}/g)].map((match) => match[1]);
}

const joined = [
  ...FAQ.flatMap((item) => [item.q, item.title, ...item.body]),
  ...GLOSSARY.flatMap((entry) => [entry.term, entry.tip, ...entry.body]),
  ...REAL,
  ...DEMO,
  HIPAA_LINE,
  ...WALKTHROUGH.flatMap((step) => [step.title, step.body, step.link]),
].join("\n");

test("glossary covers the proof words and each tip is usable", () => {
  assert.deepEqual(
    GLOSSARY.map((entry) => entry.id),
    [...GLOSSARY_IDS],
  );
  const terms = GLOSSARY.map((entry) => entry.term);
  for (const term of ["TEE", "attestation", "provider_tee", "receipt", "ticket", "nonce", "revoke", "hash on chain", "testnet", "yoctoNEAR", "function-call key", "de-identification"]) {
    assert.ok(terms.includes(term), term);
  }
  for (const entry of GLOSSARY) {
    assert.ok(entry.tip.length > 40 && entry.tip.length < 240, entry.id);
    assert.ok(entry.body.length >= 2, entry.id);
    assert.equal(isGlossaryId(entry.id), true);
  }
});

test("FAQ is grouped by role and states the honest limits", () => {
  for (const role of FAQ_ROLES) {
    assert.ok(FAQ.some((item) => item.role === role.id), role.id);
  }
  assert.match(joined, /Revoke cannot erase a copy someone already downloaded/);
  assert.match(joined, /best effort, with a preview/);
  assert.match(joined, /server sees the plaintext chart for the TEE call/);
  assert.match(joined, /held by the demo server on testnet/);
  assert.match(joined, /fictional/);
  assert.match(joined, /ids and hashes/);
  assert.match(joined, /Designed around HIPAA principles/);
  assert.match(joined, /not medical advice/);
  for (const token of tokens(joined)) assert.equal(isGlossaryId(token), true, token);
});

test("owned pages avoid em dashes, forbidden claims, and production protection", () => {
  const support = readFileSync(path.join(here, "../../app/support/page.tsx"), "utf8");
  assert.match(support, /Nothing is sent/);
  assert.match(support, /\/api\/status/);
  assert.match(support, /\/api\/demo\/config/);
  assert.match(support, /explainError/);
  assert.match(support, /testnet\.nearblocks\.io\/address/);
  assert.doesNotMatch(support, /protection|Hosted preview/i);
  for (const file of [...pages, ...copyFiles]) {
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes("—"), false, file);
    assert.doesNotMatch(text, /HIPAA compliant|audited|certified|vulnerability-free|protection on/i, file);
  }
});

test("the 3-minute walkthrough links to screens that exist", () => {
  assert.equal(WALKTHROUGH[0]?.at, "Step 1");
  assert.equal(WALKTHROUGH.at(-1)?.at, "Step 7");
  assert.equal(WALKTHROUGH.length, 7);
  for (const step of WALKTHROUGH) {
    assert.match(step.href, /^\//);
    assert.ok(step.body.length > 40);
  }
});
