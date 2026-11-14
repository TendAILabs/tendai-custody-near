import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONTRACT_METHODS,
  DOC_SECTIONS,
  FAQ,
  WHITEPAPER_PDF_URL,
  WHITEPAPER_URL,
  docsPlainText,
} from "../../content/docs.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");
const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
const { createElement } = require("react") as typeof import("react");

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../..");

const SOURCE_FILES = [
  "../../content/docs.ts",
  "../../components/docs/docs-view.tsx",
  "../../components/docs/docs.css",
  "../../app/docs/page.tsx",
].map((file) => path.join(here, file));

function compile(from: string, to: string) {
  const source = readFileSync(from, "utf8");
  const out = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: from,
  }).outputText;
  mkdirSync(path.dirname(to), { recursive: true });
  writeFileSync(to, out);
}

function renderDocs(): string {
  const cache = path.join(webRoot, "node_modules/.cache/docs-render");
  compile(path.join(webRoot, "content/docs.ts"), path.join(cache, "content/docs.js"));
  compile(path.join(webRoot, "components/docs/docs-view.tsx"), path.join(cache, "components/docs/docs-view.js"));
  const loaded = require(path.join(cache, "components/docs/docs-view.js")) as {
    DocsView: (props: { tools?: unknown }) => import("react").ReactElement;
  };
  return renderToStaticMarkup(createElement(loaded.DocsView));
}

test("docs content has at least 12 FAQ answers and a null whitepaper", () => {
  assert.ok(FAQ.length >= 12);
  assert.equal(new Set(FAQ.map((item) => item.id)).size, FAQ.length);
  for (const item of FAQ) {
    assert.ok(item.question.endsWith("?"), item.id);
    assert.ok(item.answer.length >= 1, item.id);
  }
  assert.equal(WHITEPAPER_URL, null);
  assert.equal(WHITEPAPER_PDF_URL, null);
  assert.ok(CONTRACT_METHODS.length >= 20);
  assert.equal(new Set(DOC_SECTIONS.map((section) => section.id)).size, DOC_SECTIONS.length);
});

test("docs copy does not say HIPAA compliant and has no em dash", () => {
  const text = [docsPlainText(), ...SOURCE_FILES.map((file) => readFileSync(file, "utf8"))].join("\n");
  assert.equal(text.includes("\u2014"), false);
  assert.equal(/HIPAA compliant/i.test(text), false);
});

test("the docs route renders TOC anchors, the FAQ, and the whitepaper placeholder", () => {
  const html = renderDocs();
  assert.match(html, /<h1>Documentation<\/h1>/);
  assert.match(html, /id="docs-main"/);
  assert.match(html, /Skip to content/);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const tocHrefs = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]).filter((id) => id !== "docs-main");
  assert.ok(tocHrefs.length >= DOC_SECTIONS.length * 2);
  for (const section of DOC_SECTIONS) {
    assert.equal(ids.has(section.id), true, section.id);
    assert.equal(tocHrefs.includes(section.id), true, section.id);
  }
  for (const item of FAQ) assert.equal(ids.has(item.id), true, item.id);
  assert.equal((html.match(/<details/g) ?? []).length, FAQ.length + 1);
  for (const item of FAQ) assert.match(html, new RegExp(`<summary>[\\s\\S]*${item.question.replace(/[?]/g, "\\?")}`));
  assert.match(html, /The whitepaper is coming/);
  assert.equal(html.includes("Download the PDF"), false);
  assert.equal(html.includes("\u2014"), false);
  assert.equal(/HIPAA compliant/i.test(html), false);
  assert.match(html, /Designed around HIPAA principles/);
  assert.match(html, /rr191f8afd-contract\.testnet/);
  assert.match(html, /href="https:\/\/truenav\.app"/);
});

test("docs metadata and site links point at /docs", () => {
  const page = readFileSync(path.join(webRoot, "app/docs/page.tsx"), "utf8");
  assert.match(page, /DOC_TITLE/);
  assert.match(page, /DOC_DESCRIPTION/);
  assert.match(page, /openGraph/);
  assert.match(page, /twitter/);
  const shell = readFileSync(path.join(webRoot, "components/wireframe/shell.tsx"), "utf8");
  assert.match(shell, /pathname === "\/docs"/);
  assert.match(shell, /href="\/docs"/);
  const header = readFileSync(path.join(webRoot, "components/landing/header.tsx"), "utf8");
  const footer = readFileSync(path.join(webRoot, "components/landing/footer.tsx"), "utf8");
  const hero = readFileSync(path.join(webRoot, "components/landing/hero.tsx"), "utf8");
  assert.match(header, /links\.docs/);
  assert.match(footer, /links\.docs/);
  assert.match(hero, /links\.docs/);
});
