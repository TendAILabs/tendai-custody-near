import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("page body is outside the useSearchParams prerender boundary", () => {
  const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../../components/wireframe/shell.tsx", import.meta.url), "utf8");

  assert.match(layout, /<Suspense fallback=\{null\}>\s*<Shell>\{children\}<\/Shell>\s*<\/Suspense>/);

  const calls = shell.match(/useSearchParams\(/g) ?? [];
  assert.equal(calls.length, 2);
  const orgStart = shell.indexOf("function ClinicianOrgBar");
  const liveStart = shell.indexOf("function ChromeLive");
  const chromeStart = shell.indexOf("function Chrome(");
  assert.ok(orgStart > 0 && liveStart > orgStart && chromeStart > liveStart);
  assert.match(shell.slice(orgStart, liveStart), /useSearchParams\(/);
  assert.match(shell.slice(liveStart, chromeStart), /useSearchParams\(/);
  assert.match(shell, /<Suspense fallback=\{null\}>\s*<ClinicianOrgBar/);

  const suspense = shell.indexOf("<Suspense");
  const main = shell.indexOf("<main>{children}</main>");
  assert.ok(suspense > 0 && main > suspense);
  assert.match(shell, /fallback=\{<Chrome search="" /);
});

test("app chrome keeps help in the header and moves status to the footer", () => {
  const shell = readFileSync(new URL("../../components/wireframe/shell.tsx", import.meta.url), "utf8");
  const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"));
  const footer = shell.slice(shell.indexOf("<footer"), shell.indexOf("</footer>"));
  assert.equal(header.includes("StatusChip"), false);
  assert.equal(header.includes("AskLaunch"), false);
  assert.match(header, /HelpMenu/);
  assert.match(header, /Guide/);
  assert.match(footer, /<StatusChip \/>/);
  assert.match(shell, /className="ask-dock"/);
  const roles = readFileSync(new URL("../../components/wireframe/nav/role-tabs.tsx", import.meta.url), "utf8");
  assert.equal(roles.includes("org-picker"), false);
  const picker = readFileSync(new URL("../../components/wireframe/nav/org-picker.tsx", import.meta.url), "utf8");
  assert.match(picker, /data-testid="org-picker"/);
});
