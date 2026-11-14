import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { memoryStore } from "../guard/visitor.ts";
import { newVisitorSession, writeVisitorCookie } from "../session/visitor.ts";
import { handleSign, type SignCallInput } from "./sign-handler.ts";
import type { SignAccounts } from "./sign-allow.ts";

const SECRET = "test-session-secret";
const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const HEX = "ab".repeat(32);
const FULL_NAME = ["PULSEFIT", "FULL", "PRIVATE", "KEY"].join("_");
const FC_NAME = ["PULSEFIT", "FC", "PRIVATE", "KEY"].join("_");
const APP_ID = "rr-pulsefit-6c9910d7.testnet";
const FC_MARKER = "pulsefit-fc-test-marker";
const FULL_MARKER = "pulsefit-full-test-marker";

const ACCOUNTS: SignAccounts = {
  clinic: "rr-clinic-a-6c9910d7.testnet",
  patient: "rr-patient-6c9910d7.testnet",
  hospital: "rr-hospital-b-6c9910d7.testnet",
  second: "rr-second-6c9910d7.testnet",
  app: APP_ID,
};

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "target", ".git", ".data"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (CODE_EXT.has(path.extname(name))) out.push(full);
  }
  return out;
}

function cookie(): string {
  const session = newVisitorSession(NOW);
  session.shares.push("4");
  return writeVisitorCookie(session, SECRET, false).split(";")[0] ?? "";
}

function request(): Request {
  return new Request("https://demo.test/api/sign", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookie() },
    body: JSON.stringify({ role: "app", method: "request_open", args: { share_id: "4", nonce_hash: HEX } }),
  });
}

test("app code never reads the PulseFit full-access key", () => {
  const files = walk(repo);
  const hits = files.filter((file) => readFileSync(file, "utf8").includes(FULL_NAME));
  const relative = hits.map((file) => path.relative(repo, file)).sort();
  assert.deepEqual(relative, ["scripts/pulsefit-fc-key.ts", "scripts/setup-testnet.ts"]);
  const webHits = relative.filter((file) => file.startsWith("web/"));
  assert.deepEqual(webHits, []);
  const handler = readFileSync(path.join(repo, "web/lib/near/sign-handler.ts"), "utf8");
  assert.equal(handler.includes(FC_NAME), true);
  assert.equal(handler.includes(FULL_NAME), false);
  const setupName = ["setup", "testnet"].join("-");
  const helperName = ["pulsefit", "fc", "key"].join("-");
  for (const file of walk(path.join(repo, "web"))) {
    if (file.endsWith("pulsefit-key.test.ts")) continue;
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes(setupName), false, file);
    assert.equal(source.includes(helperName), false, file);
  }
});

test("PulseFit signing uses the function-call key and fails closed when it is missing", async () => {
  const saved = {
    fc: process.env[FC_NAME],
    full: process.env[FULL_NAME],
    id: process.env.PULSEFIT_ACCOUNT_ID,
  };
  const calls: SignCallInput[] = [];
  const deps = {
    now: NOW,
    store: memoryStore({ isolated: true }),
    secret: SECRET,
    accounts: ACCOUNTS,
    contractId: "rr6c9910d7.testnet",
    call: async (input: SignCallInput) => {
      calls.push(input);
      return { hash: "tx-hash", value: null };
    },
  };
  try {
    process.env.PULSEFIT_ACCOUNT_ID = APP_ID;
    process.env[FULL_NAME] = FULL_MARKER;
    delete process.env[FC_NAME];
    const missing = await handleSign(request(), deps);
    const missingBody = (await missing.json()) as { error?: string };
    assert.equal(missing.status, 500);
    assert.equal(missingBody.error, "signer not configured");
    assert.equal(calls.length, 0);

    process.env[FC_NAME] = "";
    const empty = await handleSign(request(), deps);
    const emptyBody = (await empty.json()) as { error?: string };
    assert.equal(empty.status, 500);
    assert.equal(emptyBody.error, "signer not configured");
    assert.equal(calls.length, 0);

    process.env[FC_NAME] = FC_MARKER;
    const signed = await handleSign(request(), deps);
    assert.equal(signed.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.accountId, APP_ID);
    assert.equal(calls[0]?.secret, FC_MARKER);
    assert.notEqual(calls[0]?.secret, FULL_MARKER);
    assert.equal(calls[0]?.methodName, "request_open");
    assert.equal(calls[0]?.deposit, BigInt(0));
  } finally {
    if (saved.fc === undefined) delete process.env[FC_NAME];
    else process.env[FC_NAME] = saved.fc;
    if (saved.full === undefined) delete process.env[FULL_NAME];
    else process.env[FULL_NAME] = saved.full;
    if (saved.id === undefined) delete process.env.PULSEFIT_ACCOUNT_ID;
    else process.env.PULSEFIT_ACCOUNT_ID = saved.id;
  }
});
