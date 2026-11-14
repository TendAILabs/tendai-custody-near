import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter((name) => name.endsWith(".tsx") || name === "cards.ts")
  .map((name) => path.join(here, name));
const joined = files.map((file) => readFileSync(file, "utf8")).join("\n");

test("landing story stays specific and keeps the checked facts", () => {
  assert.equal(joined.includes("\u2014"), false);
  assert.equal(joined.includes("\u2013"), false);
  assert.equal(/HIPAA compliant/i.test(joined), false);
  assert.equal(/reproducible build/i.test(joined), false);
  assert.equal(/11 attacks/i.test(joined), false);
  assert.equal(/St\. Aster/i.test(joined), false);
  assert.equal(/4 events/i.test(joined), false);
  assert.equal(/fourth line/i.test(joined), false);
  assert.equal(/not our customers/i.test(joined), false);
  assert.equal(/Not a pilot/i.test(joined), false);
  assert.match(joined, /Designed around HIPAA principles/);
  assert.match(joined, /fictional example data/);
  assert.match(joined, /best effort/i);
  assert.match(joined, /cannot erase a copy someone already downloaded/);
  assert.match(joined, /contact@tendaicustody\.app/);
  assert.match(joined, /11 \/ 11 checks passed/);
  assert.match(joined, /5 attempts refused/);
  assert.match(joined, /not testnet transactions/);
  assert.match(joined, /writes no\s+event/);
  assert.match(joined, /key it holds/);
  assert.match(joined, /checks the attestation at call time/);
  assert.match(joined, /build config is pinned/);
  assert.match(joined, /not an endorsement/);
  assert.match(joined, /Brindleglass Hospital opened the record/);
  assert.match(joined, /REL-0412/);
  assert.match(joined, /Dr\. Lena Park/);
  assert.match(joined, /Dr\. Sofia Reyes/);
  assert.match(joined, /role-01\.webp/);
  assert.match(joined, /role-02\.webp/);
  assert.match(joined, /role-03\.webp/);
  assert.match(joined, /A referral to a specialist/);
  assert.match(joined, /A second-opinion share/);
  assert.match(joined, /Changing your mind/);
  assert.equal(joined.includes("/for-clinics"), false);
  assert.equal(joined.includes("/newsroom"), false);
  assert.equal(joined.includes("/case-studies"), false);
});
