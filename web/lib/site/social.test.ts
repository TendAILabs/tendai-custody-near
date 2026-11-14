import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SITE_DESCRIPTION, SITE_ORIGIN, siteMetadata } from "./social.ts";

test("social metadata uses the canonical host and the custody description", () => {
  assert.equal(siteMetadata.metadataBase?.href, `${SITE_ORIGIN}/`);
  assert.equal(siteMetadata.description, SITE_DESCRIPTION);
  assert.match(SITE_DESCRIPTION, /clinic-to-hospital record sharing/);
  assert.match(SITE_DESCRIPTION, /chain-of-custody log on NEAR/);
  assert.match(SITE_DESCRIPTION, /NEAR AI TEE summary/);
  assert.match(SITE_DESCRIPTION, /Designed around HIPAA principles/);
  assert.equal(/HIPAA compliant/i.test(SITE_DESCRIPTION), false);
  assert.equal(SITE_DESCRIPTION.includes("\u2014"), false);
  assert.equal(siteMetadata.openGraph && "url" in siteMetadata.openGraph ? siteMetadata.openGraph.url : null, "./");
  assert.equal(siteMetadata.twitter && "card" in siteMetadata.twitter ? siteMetadata.twitter.card : null, "summary_large_image");
  assert.equal(siteMetadata.alternates?.canonical instanceof URL, true);
  assert.equal((siteMetadata.alternates?.canonical as URL).origin, SITE_ORIGIN);
});

test("docs metadata keeps its title and description and asks for a large card", () => {
  const page = readFileSync(new URL("../../app/docs/page.tsx", import.meta.url), "utf8");
  assert.match(page, /DOC_TITLE/);
  assert.match(page, /DOC_DESCRIPTION/);
  assert.match(page, /summary_large_image/);
  assert.match(page, /openGraph/);
  assert.match(page, /twitter/);
  assert.equal(page.includes("\u2014"), false);
  assert.equal(/HIPAA compliant/i.test(page), false);
});
