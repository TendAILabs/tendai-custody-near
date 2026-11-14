import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IdentifierBestEffort } from "../../components/wireframe/best-effort.ts";

test("the best-effort line renders whenever the summary is Verified", () => {
  const verified = renderToStaticMarkup(createElement(IdentifierBestEffort, { verified: true }));
  assert.match(verified, /Identifier check is best effort\./);
  assert.match(verified, /data-testid="identifier-best-effort"/);
  assert.match(verified, /color:\s*#A9B6CC/i);
  assert.match(verified, /font-family:\s*var\(--sans\)/);
  const idle = renderToStaticMarkup(createElement(IdentifierBestEffort, { verified: false }));
  assert.equal(idle.includes("Identifier check is best effort."), false);
});

test("Maya's verified summary card is the only inbox place that mounts the line", () => {
  const source = readFileSync(new URL("../../components/wireframe/inbox-screen.tsx", import.meta.url), "utf8");
  const start = source.indexOf('state.teeStatus === "green" && state.summaryReady');
  const end = source.indexOf(") : (", start);
  const verifiedBranch = source.slice(start, end);
  assert.match(verifiedBranch, /<Tag tone="ok">Verified<\/Tag>/);
  assert.match(verifiedBranch, /<IdentifierBestEffort verified \/>/);
  const rest = source.slice(end);
  assert.equal(rest.includes("IdentifierBestEffort"), false);
});

test("the hospital verified summary mounts the same line", () => {
  const source = readFileSync(new URL("../../components/wireframe/hospital-screen.tsx", import.meta.url), "utf8");
  const start = source.indexOf('title="Verified summary"');
  const end = source.indexOf("</Section>", start);
  const block = source.slice(start, end);
  assert.match(block, /<IdentifierBestEffort verified \/>/);
});
