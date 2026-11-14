import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { GUIDE_STEPS } from "../guide.ts";
import { buildAssistPrompt } from "./prompt.ts";
import { ASSIST_KNOWLEDGE, ASSIST_LINKS, KNOWLEDGE_QUOTES } from "./knowledge.ts";
import { SCREENS } from "./screens.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const appRoot = path.join(root, "web/app");
const banned = /\bHIPAA compliant\b|\baudited\b|\bcertified\b|\bvulnerability-free\b/i;

function pages(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.tsx") found.push(full);
    }
  };
  walk(appRoot);
  return found;
}

function routeOf(file: string): string {
  const rel = path.relative(appRoot, path.dirname(file)).split(path.sep).filter((part) => !part.startsWith("("));
  return `/${rel.join("/")}`.replace(/\/$/, "") || "/";
}

test("assist knowledge quotes are real source text", () => {
  assert.equal(KNOWLEDGE_QUOTES.length > 10, true);
  for (const quote of KNOWLEDGE_QUOTES) {
    const source = readFileSync(path.join(root, quote.file), "utf8");
    assert.equal(source.includes(quote.text), true, quote.term);
    assert.equal(ASSIST_KNOWLEDGE.includes(quote.text), true, quote.term);
  }
});

test("assist notes cover the demo facts", () => {
  const facts = [
    /Maya Okafor/,
    /Riverbend Family Clinic/,
    /St\. Aster Hospital/,
    /Dr\. Reyes/,
    /PulseFit/,
    /Lakeside Family Medicine/,
    /provider_tee/,
    /z-ai\/glm-5\.3-flash/,
    /designed around HIPAA principles/i,
    /best effort/i,
    /cannot erase a copy/i,
    /testnet/i,
    /mainnet/i,
    /1 yoctoNEAR/,
    /120 seconds/,
    /self-registration/,
    /create_record/,
    /approve_share/,
    /request_open/,
    /revoke_share/,
    /The contract is a neutral record that no clinic can edit/,
    /private enclave/,
    /only after Open chart succeeds/,
    /rr191f8afd-contract\.testnet/,
    /demo server holds Maya's key on testnet/,
    /Revoke is step 5/,
    /The refused open is step 6/,
    /Contact support on \/help, sign in with a NEAR testnet wallet, no email is collected/,
    /\/support page is the status page/,
    /\[Status\]\(\/support\)/,
  ];
  for (const fact of facts) assert.match(ASSIST_KNOWLEDGE, fact, String(fact));
  assert.equal(ASSIST_KNOWLEDGE.includes("[Support](/support)"), false);
  for (const step of GUIDE_STEPS) {
    assert.equal(ASSIST_KNOWLEDGE.includes(step.label), true, step.label);
    assert.equal(ASSIST_KNOWLEDGE.includes(step.href.split("?")[0] ?? step.href), true, step.href);
  }
});

test("assist links and screen next steps are real routes", () => {
  const routes = new Set(pages().map(routeOf));
  const hrefs = [
    ...ASSIST_LINKS,
    ...SCREENS.map((screen) => screen.nextHref),
    ...[...ASSIST_KNOWLEDGE.matchAll(/\]\((\/[^)\s]*)\)/g)].map((match) => match[1] ?? ""),
  ];
  for (const href of hrefs) {
    const route = (href.split("?")[0] ?? href).split("#")[0] ?? href;
    assert.equal(routes.has(route), true, href);
    assert.equal(existsSync(path.join(root, "web")), true);
  }
});

test("screen notes match saved support notes and refused opens", () => {
  const support = SCREENS.find((item) => item.route === "/support");
  const blocked = SCREENS.find((item) => item.route === "/hospital/blocked");
  const supportText = `${support?.does ?? ""} ${support?.buttons ?? ""}`;
  assert.match(supportText, /Signed support notes from Help are saved/);
  assert.match(supportText, /30 days after its last update/);
  assert.doesNotMatch(supportText, /does not store|not stored/i);
  assert.match(blocked?.does ?? "", /does not necessarily create a custody event/);
  assert.doesNotMatch(blocked?.does ?? "", /refused and logged/);
  const prompt = buildAssistPrompt("/support");
  const promptBody = prompt
    .split("\n")
    .filter((line) => !line.startsWith("Never say these phrases:"))
    .join("\n");
  assert.match(promptBody, /30 days after its last update/);
  assert.match(promptBody, /does not necessarily create a custody event/);
  assert.equal(promptBody.includes("\u2014"), false);
  assert.doesNotMatch(promptBody, /\bHIPAA compliant\b|\baudited\b|\bvulnerability-free\b/i);
});

test("assist notes and the system prompt avoid forbidden claims", () => {
  const prompt = buildAssistPrompt("/patient");
  const neverSay = prompt.split("\n").filter((line) => line.startsWith("Never say these phrases:"));
  const promptBody = prompt
    .split("\n")
    .filter((line) => !line.startsWith("Never say these phrases:"))
    .join("\n");
  for (const text of [ASSIST_KNOWLEDGE, promptBody]) {
    assert.equal(banned.test(text), false, text.slice(0, 80));
    assert.equal(text.includes("\u2014"), false);
    assert.equal(/protection on/i.test(text), false);
  }
  assert.equal(neverSay.length, 1);
  assert.match(neverSay[0] ?? "", /HIPAA compliant/);
  assert.match(neverSay[0] ?? "", /\baudited\b/);
  assert.match(neverSay[0] ?? "", /vulnerability-free/);
  assert.match(prompt, /designed around HIPAA principles/i);
  assert.match(prompt, /can't share that/);
  assert.match(prompt, /Do not say it is missing from the demo/);
  assert.match(prompt, /Do not restate the previous answer/);
  assert.match(prompt, /clarifying question/i);
  assert.match(prompt, /not in this demo/i);
  assert.match(prompt, /demo server holds Maya's key on testnet/);
  assert.match(prompt, /Revoke is step 5/);
  assert.match(prompt, /refused open is step 6/);
  assert.match(prompt, /No email is collected/);
});
