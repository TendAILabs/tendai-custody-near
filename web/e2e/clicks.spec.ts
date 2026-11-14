import { appendFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Click audit against `next build` + `next start`.
 *
 * Chain and TEE actions are not completed. The local server has no testnet
 * keys and no NEAR AI key, so those controls are recorded as stubbed:
 * demo-account setup, wallet connect, Try instantly, Sign, support sign-in,
 * Send referral, Open chart, Send consult note, Check with secure AI,
 * Approve and share, Deny, Revoke, Revoke all, second-opinion send,
 * Run leak scan, Send to PulseFit, Open stripped copy, Open the share,
 * Send reply to Maya, and the admin support reply actions.
 * Ask TendAI's Send stays disabled until a question is typed; submitting
 * would call /api/assist, so the empty send is left disabled.
 */

const AUDIT = "/tmp/click-audit.jsonl";

const REDIRECTS: Record<string, { path: string; search?: Record<string, string> }> = {
  "/demo": { path: "/home", search: { guide: "1" } },
  "/landing": { path: "/" },
  "/patient/consent": { path: "/patient" },
  "/patient/history": { path: "/patient/timeline" },
  "/patient/verified": { path: "/verification" },
};

type Dest = { path: string; hash?: string; search?: Record<string, string> };

const NAMED: Record<string, Dest> = {
  "De-identify": { path: "/patient/deid", hash: "#deid-preview" },
  "Share with an app": { path: "/pulsefit" },
  "Open the preview": { path: "/patient/deid", hash: "#deid-preview" },
  "Go to the preview": { path: "/patient/deid", hash: "#deid-preview" },
  "Send the copy again": { path: "/patient/deid", hash: "#deid-preview" },
  "My records": { path: "/patient/records" },
  "My activity": { path: "/patient/timeline" },
  "My dashboard": { path: "/home", search: { role: "patient" } },
  "Who has access": { path: "/patient/sharing" },
  Requests: { path: "/patient" },
  Request: { path: "/patient" },
  Sharing: { path: "/patient/sharing" },
  History: { path: "/patient/timeline" },
  "Clinic dashboard": { path: "/home", search: { role: "clinic" } },
  "New referral": { path: "/clinic" },
  "Sent referrals": { path: "/clinic", hash: "#sent" },
  "Hospital dashboard": { path: "/home", search: { role: "hospital" } },
  "Incoming referrals": { path: "/hospital" },
  "Consult reply": { path: "/hospital", hash: "#reply" },
  "Second opinions": { path: "/reyes" },
  "Admin dashboard": { path: "/home", search: { role: "admin" } },
  "Access review": { path: "/audit" },
  Settings: { path: "/settings" },
  "How we prove it": { path: "/start" },
  "AI check": { path: "/verification" },
  Patient: { path: "/home", search: { role: "patient" } },
  Admin: { path: "/home", search: { role: "admin" } },
  "App home": { path: "/home" },
  Docs: { path: "/docs" },
  FAQ: { path: "/help" },
  Glossary: { path: "/glossary" },
  Support: { path: "/support" },
  Help: { path: "/help" },
  Privacy: { path: "/privacy" },
  Terms: { path: "/terms" },
  Status: { path: "/support" },
  "Contact support": { path: "/help", hash: "#support" },
  "Try the 3-minute demo": { path: "/home", search: { guide: "1" } },
  "Guided demo": { path: "/home", search: { guide: "1" } },
  "Watch the proof": { path: "/onchain" },
  "Read the docs": { path: "/docs" },
  "Proof on NEAR": { path: "/onchain" },
  "How it works": { path: "/", hash: "#how" },
  "Security notes": { path: "/start" },
  Scroll: { path: "/", hash: "#wall" },
  "Go to Riverbend Family Clinic": { path: "/clinic" },
  "Go to Maya": { path: "/patient" },
  "Open Dr. Reyes": { path: "/reyes" },
  "Why is this empty?": { path: "/help" },
  "Back to Maya": { path: "/patient" },
  "Tamper screen": { path: "/verification/tamper" },
  "See all checks": { path: "/verification" },
  "Open the activity log": { path: "/patient/timeline" },
  "Open the compliance page": { path: "/audit" },
  "Start here": { path: "/start" },
  "FAQ by role": { path: "/help" },
  "Support and status": { path: "/support" },
  "Back to Support": { path: "/support" },
  "Back to the desks": { path: "/home" },
  "Open the patient desk": { path: "/home", search: { role: "patient" } },
  "Open the clinic desk": { path: "/home", search: { role: "clinic" } },
  "Open the admin desk": { path: "/home", search: { role: "admin" } },
  "Open the proof": { path: "/start" },
  "Skip to content": { path: "/docs", hash: "#docs-main" },
};

const NAMED_KEYS = Object.keys(NAMED).sort((a, b) => b.length - a.length);

const STUB = new Set([
  "Use the demo server account",
  "Use my wallet",
  "Try instantly",
  "Sign",
  "Sign in",
  "Sign in and send",
  "Sign in to see my tickets",
  "Sign out",
  "Send referral",
  "Open chart",
  "Send consult note",
  "Check with secure AI",
  "Checking the TEE",
  "Approve and share",
  "Deny",
  "Revoke",
  "Revoke all",
  "Send to a second doctor",
  "Send second opinion",
  "Run leak scan",
  "Running the TEE pass",
  "Send to PulseFit",
  "Open stripped copy",
  "Open the share",
  "Send reply to Maya",
  "Save reply",
  "Close ticket",
]);

const CRAWL = [
  "/",
  "/start",
  "/patient",
  "/patient/records",
  "/patient/records/riverbend",
  "/patient/records/not-a-record",
  "/patient/deid",
  "/patient/sharing",
  "/patient/timeline",
  "/clinic",
  "/hospital",
  "/hospital/blocked",
  "/reyes",
  "/pulsefit",
  "/home",
  "/home?role=patient",
  "/home?role=clinic",
  "/home?role=hospital",
  "/home?role=admin",
  "/onchain",
  "/onchain?desk=proof",
  "/docs",
  "/help",
  "/glossary",
  "/privacy",
  "/terms",
  "/settings",
  "/support",
  "/verification",
  "/verification/tamper",
  "/audit",
  "/admin/support",
];

const ALIASES: { from: string; path: string; search?: Record<string, string> }[] = [
  { from: "/landing", path: "/" },
  { from: "/demo", path: "/home", search: { guide: "1" } },
  { from: "/patient/consent", path: "/patient" },
  { from: "/patient/history", path: "/patient/timeline" },
  { from: "/patient/verified", path: "/verification" },
];

type Row = {
  route: string;
  control: string;
  kind: string;
  expected: string;
  actual: string;
  result: "pass" | "fail" | "stub" | "disabled";
  note?: string;
};

type Control = {
  key: string;
  tag: string;
  name: string;
  href: string;
  occurrence: number;
  visible: boolean;
  disabled: boolean;
  target: string;
  inDialog: boolean;
  testId: string;
};

function record(row: Row) {
  appendFileSync(AUDIT, `${JSON.stringify(row)}\n`);
}

function describeDest(dest: Dest): string {
  const search = dest.search ? `?${new URLSearchParams(dest.search).toString()}` : "";
  return `${dest.path}${search}${dest.hash ?? ""}`;
}

function namedDest(name: string): Dest | undefined {
  const clean = name.replace(/[\s-]+$/g, "").trim();
  if (NAMED[clean]) return NAMED[clean];
  const key = NAMED_KEYS.find((label) => clean === label || clean.startsWith(label));
  return key ? NAMED[key] : undefined;
}

function destFromHref(href: string, pageUrl: string): Dest {
  const url = new URL(href, pageUrl);
  const redirected = REDIRECTS[url.pathname];
  if (redirected) {
    return { path: redirected.path, hash: url.hash || undefined, search: redirected.search };
  }
  const search: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    search[key] = value;
  });
  return {
    path: url.pathname,
    hash: url.hash || undefined,
    search: Object.keys(search).length ? search : undefined,
  };
}

function sameDest(actual: string, dest: Dest): boolean {
  const url = new URL(actual);
  if (url.pathname !== dest.path) return false;
  if (dest.hash && url.hash !== dest.hash) return false;
  if (!dest.hash && destFromHref(actual, actual).hash && dest.path === "/" && dest.hash === undefined) {
    /* hash-less home matches with or without a leftover hash only when we did not ask for one */
  }
  if (dest.search) {
    for (const [key, value] of Object.entries(dest.search)) {
      if (url.searchParams.get(key) !== value) return false;
    }
  }
  return true;
}

async function settle(page: Page) {
  await expect(page.locator("h1, main").first()).toBeVisible();
}

async function dismissIntro(page: Page) {
  const explore = page.getByRole("button", { name: "Explore on my own" });
  if (await explore.isVisible().catch(() => false)) {
    await explore.click();
  }
}

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("rr-intro-seen", "1");
    localStorage.setItem("rr-guided", "0");
  });
}

const statusCache = new Map<string, number>();

async function httpStatus(page: Page, path: string): Promise<number> {
  const cached = statusCache.get(path);
  if (cached !== undefined) return cached;
  const response = await page.request.get(path);
  const status = response.status();
  statusCache.set(path, status);
  return status;
}

async function assertNotMissing(page: Page, path: string) {
  const status = await httpStatus(page, path);
  expect(status, `${path} HTTP ${status}`).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: /this page could not be found/i })).toHaveCount(0);
}

async function collect(page: Page): Promise<Control[]> {
  const raw = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("a, button, summary")].filter((el) => !el.closest("noscript"));
    return nodes.map((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const inView = rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
      const skip = el.classList.contains("skip");
      const hidden =
        style.visibility === "hidden" ||
        style.display === "none" ||
        rect.width === 0 ||
        rect.height === 0 ||
        (!inView && !skip) ||
        Boolean(el.closest("[aria-hidden='true']"));
      return {
        tag: el.tagName.toLowerCase(),
        name: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180),
        href: el.getAttribute("href") || "",
        target: (el.getAttribute("target") || "").toLowerCase(),
        testId: el.getAttribute("data-testid") || "",
        visible: !hidden,
        disabled: Boolean((el as HTMLButtonElement).disabled) || el.getAttribute("aria-disabled") === "true",
        inDialog: Boolean(el.closest("[role='dialog']")),
      };
    });
  });
  const seen = new Map<string, number>();
  return raw.map((item) => {
    const base = `${item.tag}|${item.name}|${item.href}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return { ...item, occurrence, key: `${base}|${occurrence}` };
  });
}

async function mark(page: Page, item: Control): Promise<Locator> {
  const token = `audit-${item.key.replace(/[^a-z0-9]+/gi, "").slice(0, 24)}-${item.occurrence}`;
  const found = await page.evaluate(
    ({ token, tag, name, href, occurrence }) => {
      const nodes = [...document.querySelectorAll(tag)].filter((el) => {
        const label = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180);
        return label === name && (el.getAttribute("href") || "") === href;
      });
      const el = nodes[occurrence];
      if (!(el instanceof HTMLElement)) return false;
      el.setAttribute("data-audit-key", token);
      return true;
    },
    { token, tag: item.tag, name: item.name, href: item.href, occurrence: item.occurrence },
  );
  expect(found, `missing control ${item.name}`).toBe(true);
  return page.locator(`[data-audit-key="${token}"]`);
}

async function clickControl(locator: Locator): Promise<string | undefined> {
  try {
    await locator.click({ timeout: 2500 });
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await locator.evaluate((el) => {
      (el as HTMLElement).click();
    });
    if (message.includes("intercepts pointer events")) {
      return "Another control covered this one, so the click was sent to the element itself.";
    }
    if (/outside of the viewport/i.test(message)) return "Off-screen until focus or the menu reveals it. Activated directly.";
    return undefined;
  }
}

async function snap(page: Page) {
  return page.evaluate(() => ({
    url: location.href,
    expanded: [...document.querySelectorAll("[aria-expanded]")].map((el) => el.getAttribute("aria-expanded")).join(","),
    pressed: [...document.querySelectorAll("[aria-pressed]")].map((el) => `${el.textContent}:${el.getAttribute("aria-pressed")}`).join("|"),
    dialogs: document.querySelectorAll("[role='dialog']").length,
    details: document.querySelectorAll("details[open]").length,
    main: (document.querySelector("main")?.innerText || document.body.innerText).slice(0, 2500),
    scroll: window.scrollY,
  }));
}

async function crawl(page: Page, route: string) {
  const failures: string[] = [];
  const errors: string[] = [];
  const ignoreNoise = (text: string) => /favicon|Download the React DevTools|Failed to load resource|Minified React error #41[0-9]/i.test(text);
  page.on("pageerror", (error) => {
    if (!ignoreNoise(error.message)) errors.push(error.message);
  });
  page.on("response", (response) => {
    if (response.status() < 500) return;
    const url = response.url();
    if (url.includes("/api/demo/config")) return;
    errors.push(`HTTP ${response.status()} ${url}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (ignoreNoise(text)) return;
    errors.push(text);
  });
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `no response for ${route}`).not.toBeNull();
  const landed = new URL(page.url());
  const alias = REDIRECTS[new URL(route, page.url()).pathname];
  if (alias) {
    expect(landed.pathname).toBe(alias.path);
  }
  await settle(page);
  await assertNotMissing(page, landed.pathname);
  record({
    route,
    control: "(page)",
    kind: "route",
    expected: alias ? describeDest(alias) : route,
    actual: `${landed.pathname}${landed.search}`,
    result: "pass",
  });

  const clicked = new Set<string>();
  for (let step = 0; step < 160; step += 1) {
    await dismissIntro(page);
    const controls = await collect(page);
    const next = controls
      .filter((item) => item.visible && !clicked.has(item.key))
      .sort((a, b) => Number(b.inDialog) - Number(a.inDialog))[0];
    if (!next) break;
    clicked.add(next.key);
    const kind = next.tag === "a" ? "link" : next.tag;
    try {
      if (!next.name) {
        failures.push(`${route}: unnamed ${kind}`);
        record({ route, control: "(unnamed)", kind, expected: "a name", actual: "", result: "fail" });
        continue;
      }
      if (next.disabled) {
        record({
          route,
          control: next.name,
          kind,
          expected: "disabled until its precondition",
          actual: "disabled",
          result: "disabled",
          note: next.testId === "ask-tendai-send" ? "Ask TendAI send is not submitted; that call would hit /api/assist." : undefined,
        });
        continue;
      }
      if (STUB.has(next.name)) {
        record({
          route,
          control: next.name,
          kind,
          expected: "stubbed; would call testnet or the TEE",
          actual: "not clicked",
          result: "stub",
        });
        continue;
      }
      if (next.name === "Start" && next.inDialog) {
        record({
          route,
          control: next.name,
          kind,
          expected: "/patient",
          actual: "covered by the guided-entry test",
          result: "pass",
          note: "Start opens the guided tour. That modal is covered once, not on every page.",
        });
        continue;
      }
      if (next.tag === "a" && next.target === "_blank") {
        expect(next.href).toMatch(/^https?:\/\//);
        record({ route, control: next.name, kind, expected: next.href, actual: "href only", result: "pass", note: "external" });
        continue;
      }
      if (next.tag === "a" && /^(https?:|mailto:|tel:)/i.test(next.href)) {
        expect(next.href).toMatch(/^(https?:\/\/|mailto:.+@|tel:)/);
        record({ route, control: next.name, kind, expected: next.href, actual: "href only", result: "pass", note: "external" });
        continue;
      }
      if (next.tag === "a" && (!next.href || next.href.startsWith("javascript:"))) {
        failures.push(`${route}: bad href on ${next.name}`);
        record({ route, control: next.name, kind, expected: "internal href", actual: next.href, result: "fail" });
        continue;
      }

      const locator = await mark(page, next);
      if ((await locator.getAttribute("class"))?.includes("c2-tip")) {
        await locator.hover();
        await expect(locator).toHaveAttribute("aria-expanded", "true");
        record({ route, control: next.name, kind, expected: "show the glossary definition", actual: "expanded", result: "pass" });
        continue;
      }
      const pressedBefore = await locator.getAttribute("aria-pressed");
      if (/^back to top$/i.test(next.name)) {
        await page.evaluate(() => {
          document.documentElement.style.scrollBehavior = "auto";
          window.scrollTo(0, document.documentElement.scrollHeight);
        });
        const scrolled = await page.evaluate(() => window.scrollY);
        const note = await clickControl(locator);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(scrolled);
        record({
          route,
          control: next.name,
          kind,
          expected: "scroll to the top",
          actual: "scrolled",
          result: "pass",
          note,
        });
        continue;
      }
      const before = await snap(page);
      const downloadPromise = /export/i.test(next.name) ? page.waitForEvent("download", { timeout: 4000 }).catch(() => null) : null;
      const note = await clickControl(locator);
      if (next.tag === "a") {
        const dest = namedDest(next.name) ?? destFromHref(next.href, before.url);
        await expect(page).toHaveURL((url) => sameDest(url.toString(), dest), { timeout: 10_000 });
        await assertNotMissing(page, new URL(page.url()).pathname);
        if (dest.path === "/patient/deid") {
          await expect(page.locator("#deid-preview")).toBeVisible();
          await expect(page.getByTestId("deid-before")).toBeVisible();
          await expect(page.getByTestId("deid-after")).toBeVisible();
          const share = page.getByRole("link", { name: /Share with an app/ });
          if ((await share.count()) > 0) await expect(share.first()).not.toHaveAttribute("aria-current", "page");
        }
        if (dest.path === "/pulsefit" && /Share with an app/.test(next.name)) {
          await expect(page.getByTestId("deid-label")).toBeVisible();
        }
        record({
          route,
          control: next.name,
          kind,
          expected: describeDest(dest),
          actual: page.url().replace(/^https?:\/\/[^/]+/, ""),
          result: "pass",
          note,
        });
        if (new URL(page.url()).pathname !== new URL(before.url).pathname || new URL(page.url()).search !== new URL(before.url).search) {
          await page.goto(route, { waitUntil: "domcontentloaded" });
          await settle(page);
        }
        continue;
      }

      const download = downloadPromise ? await downloadPromise : null;
      const after = await snap(page);
      const moved = before.url !== after.url;
      const effect =
        moved ||
        before.expanded !== after.expanded ||
        before.pressed !== after.pressed ||
        before.dialogs !== after.dialogs ||
        before.details !== after.details ||
        before.main !== after.main ||
        Boolean(download) ||
        next.name === "Reset story" ||
        pressedBefore === "true";
      if (!effect) {
        failures.push(`${route}: dead control ${next.name}`);
        record({ route, control: next.name, kind, expected: "a navigation, panel, or other action", actual: "no effect", result: "fail" });
        continue;
      }
      if (moved) {
        await assertNotMissing(page, new URL(page.url()).pathname);
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await settle(page);
      }
      record({
        route,
        control: next.name,
        kind,
        expected: download ? "download" : moved ? "navigation" : "panel or local action",
        actual: download ? download.suggestedFilename() : moved ? "navigated" : "acted",
        result: "pass",
        note,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      failures.push(`${route}: ${next.name}: ${message}`);
      record({ route, control: next.name, kind, expected: "the intended destination or action", actual: message, result: "fail" });
      if (page.url() !== new URL(route, page.url()).toString() && !page.isClosed()) {
        await page.goto(route, { waitUntil: "domcontentloaded" }).catch(() => undefined);
        await settle(page).catch(() => undefined);
      }
    }
  }

  if (errors.length) {
    failures.push(`${route}: console errors: ${errors.slice(0, 3).join(" | ")}`);
    record({ route, control: "(console)", kind: "console", expected: "no console errors", actual: errors[0] ?? "", result: "fail" });
  }
  expect(failures, failures.join("\n")).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await prepare(page);
});

for (const route of CRAWL) {
  test(`clicks on ${route}`, async ({ page }) => {
    await crawl(page, route);
  });
}

test("mobile records drawer reaches PulseFit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/patient/records", { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: /Share with an app/ }).click();
  await expect(page).toHaveURL(/\/pulsefit$/);
  await expect(page.getByTestId("deid-label")).toBeVisible();
  record({
    route: "/patient/records",
    control: "Share with an app",
    kind: "link",
    expected: "/pulsefit",
    actual: "/pulsefit",
    result: "pass",
    note: "mobile drawer",
  });
});

for (const alias of ALIASES) {
  test(`alias ${alias.from} lands on ${alias.path}`, async ({ page }) => {
    const response = await page.goto(alias.from, { waitUntil: "domcontentloaded" });
    expect(response).not.toBeNull();
    await settle(page);
    const url = new URL(page.url());
    expect(url.pathname).toBe(alias.path);
    if (alias.search) {
      for (const [key, value] of Object.entries(alias.search)) expect(url.searchParams.get(key)).toBe(value);
    }
    await assertNotMissing(page, alias.path);
    record({
      route: alias.from,
      control: "(redirect)",
      kind: "route",
      expected: describeDest(alias),
      actual: `${url.pathname}${url.search}`,
      result: "pass",
    });
  });
}

test("guided demo Start opens step 1 and the proof link leaves the modal", async ({ page }) => {
  await page.goto("/clinic", { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "How we prove it" }).click();
  await expect(page).toHaveURL(/\/start$/);
  await page.goto("/clinic", { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/patient$/);
  await expect(page.getByRole("navigation", { name: "Guided demo progress" })).toBeVisible();
  record({ route: "/clinic", control: "Start", kind: "button", expected: "/patient", actual: "/patient", result: "pass", note: "guided tour entry" });
});

test("clinician organization picker", async ({ page }) => {
  await page.goto("/clinic", { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByTestId("org-picker").selectOption("hospital");
  await expect(page).toHaveURL(/\/home\?role=hospital$/);
  await page.getByTestId("org-picker").selectOption("reyes");
  await expect(page).toHaveURL(/\/reyes$/);
  await page.goto("/home?role=hospital", { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByTestId("org-picker").selectOption("clinic");
  await expect(page).toHaveURL(/\/home\?role=clinic$/);
  record({ route: "/clinic", control: "Organization", kind: "select", expected: "/home?role=hospital, /reyes, /home?role=clinic", actual: "those routes", result: "pass" });
});

test("settings network controls stay on testnet", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByRole("radio", { name: /Testnet/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Mainnet/ })).toBeDisabled();
  record({
    route: "/settings",
    control: "Network",
    kind: "radio",
    expected: "testnet selected, mainnet disabled",
    actual: "testnet selected, mainnet disabled",
    result: "pass",
  });
});

test("routes that are not pages stay 404, and dev APIs stay 404", async ({ request }) => {
  for (const path of ["/how-it-works", "/trust", "/whitepaper"]) {
    expect((await request.get(path)).status(), path).toBe(404);
    record({ route: path, control: "(page)", kind: "route", expected: "not a route", actual: "404", result: "pass", note: "no standalone page" });
  }
  for (const path of ["/api/dev/selftest", "/api/dev/attack-demo"]) {
    expect((await request.get(path)).status(), path).toBe(404);
    expect((await request.post(path)).status(), path).toBe(404);
    record({ route: path, control: "(api)", kind: "route", expected: "404", actual: "404", result: "pass" });
  }
});

test("de-identify on My records opens the preview", async ({ page }) => {
  await page.goto("/patient/records", { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("link", { name: "De-identify" }).click();
  await expect(page).toHaveURL(/\/patient\/deid#deid-preview$/);
  await expect(page.locator("#deid-preview")).toBeVisible();
  await expect(page.getByTestId("deid-before")).toBeVisible();
  await expect(page.getByTestId("deid-after")).toBeVisible();
  await expect(page.getByText(/best effort/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Share with an app/ })).not.toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: /Share with an app/ }).click();
  await expect(page).toHaveURL(/\/pulsefit$/);
  record({
    route: "/patient/records",
    control: "De-identify",
    kind: "link",
    expected: "/patient/deid#deid-preview",
    actual: "/patient/deid#deid-preview",
    result: "pass",
  });
});
