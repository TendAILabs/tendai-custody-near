// Fresh HTTP bypasses against local next start. Fictional data only.
// Does not print seed, session secret, or canary values.
// Run from the repo root, with the same DEMO_ENC_SEED and DEMO_SESSION_SECRET as the server:
//   NODE_PATH=web/node_modules node --experimental-strip-types docs/redteam/repros/retest-http.mjs http://127.0.0.1:3210

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { actorKeyPair } from "../../../web/lib/crypto/actor-key.ts";
import { newVisitorSession, writeVisitorCookie } from "../../../web/lib/session/visitor.ts";

const base = process.argv[2] ?? "http://127.0.0.1:3210";
const SEED = process.env.DEMO_ENC_SEED ?? "";
const SESSION = process.env.DEMO_SESSION_SECRET ?? "";
const CANARY = "CANARY-SIGN-KEY";

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function redact(text) {
  let out = text;
  for (const secret of [SEED, SESSION, CANARY]) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  return out;
}

function line(name, detail) {
  console.log(JSON.stringify({ name, ...detail }));
}

async function call(pathName, { method = "GET", headers = {}, body, raw } = {}) {
  const response = await fetch(base + pathName, {
    method,
    headers,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    redirect: "manual",
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    cookieNames: (response.headers.getSetCookie?.() ?? []).map((cookie) => cookie.split("=")[0]),
  };
}

function flags(text) {
  return {
    hasSeed: Boolean(SEED) && text.includes(SEED),
    hasSessionSecret: Boolean(SESSION) && text.includes(SESSION),
    hasCanary: text.includes(CANARY),
    hasEd25519: text.includes("ed25519:"),
    hasEncField: /"enc"\s*:/.test(text),
    hex64: (text.match(/[0-9a-f]{64}/gi) ?? []).length,
  };
}

const patient = SEED ? actorKeyPair(SEED, "rr-patient-6c9910d7.testnet") : null;
const patientSecret = patient ? hex(patient.secretKey) : "";

function cookieFor(session) {
  if (!SESSION) return "";
  return writeVisitorCookie(session, SESSION, false).split(";")[0];
}

function payloadOf(cookie) {
  const token = cookie.split("=")[1] ?? "";
  const payload = token.split(".")[0] ?? "";
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// RR-01. Other routes, error bodies, and the client bundle.
const probes = [
  ["config", await call("/api/demo/config")],
  ["config-query", await call("/api/demo/config?enc=1&secrets=1")],
  ["config-post", await call("/api/demo/config", { method: "POST", headers: { "content-type": "application/json" }, body: {} })],
  ["status", await call("/api/status")],
  ["open", await call("/api/open", { method: "POST", headers: { "content-type": "application/json" }, body: { account_id: "rr-hospital-b-6c9910d7.testnet", nonce: "ab".repeat(32), share_id: "1" } })],
  ["sign-bad-json", await call("/api/sign", { method: "POST", headers: { "content-type": "application/json" }, raw: "{" })],
  ["summary-empty", await call("/api/tee/summary", { method: "POST", headers: { "content-type": "application/json" }, body: { chart: "   " } })],
  ["deid", await call("/api/tee/deid", { method: "POST", headers: { "content-type": "application/json" }, body: { chart: "Quinlan Voss" } })],
  ["tee-live", await call("/api/tee/live", { method: "POST", headers: { "content-type": "application/json" }, body: {} })],
  ["attest", await call("/api/nearai/v1/attestation/report")],
  ["nearai-get", await call("/api/nearai/v1/chat/completions")],
  ["missing", await call("/api/demo/secret")],
];

let secretHits = 0;
for (const [name, res] of probes) {
  const mark = flags(res.text);
  const derived = Boolean(patientSecret) && res.text.includes(patientSecret);
  if (mark.hasSeed || mark.hasSessionSecret || mark.hasCanary || mark.hasEd25519 || derived) secretHits += 1;
  let keys = [];
  try {
    keys = Object.keys(JSON.parse(res.text));
  } catch {
    keys = [];
  }
  line("rr01-route", {
    name,
    status: res.status,
    keys,
    cookieNames: res.cookieNames,
    ...mark,
    derivedPatientSecret: derived,
    snippet: redact(res.text).slice(0, 160),
  });
}

const staticRoot = path.resolve("web/.next/static");
let bundleFiles = 0;
let bundleHits = 0;
const bundleNames = ["DEMO_ENC_SEED", "DEMO_PATIENT_PRIVATE_KEY", "DEMO_SESSION_SECRET", "NEARAI_API_KEY", "OPENROUTER_API_KEY", "ed25519:", CANARY];
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else {
      bundleFiles += 1;
      const text = await readFile(full, "utf8");
      const named = bundleNames.filter((needle) => text.includes(needle));
      const derived = patientSecret && text.includes(patientSecret);
      const seed = SEED && text.includes(SEED);
      if (named.length > 0 || derived || seed) {
        bundleHits += 1;
        line("rr01-bundle-hit", { file: path.relative(staticRoot, full), named, derivedPatientSecret: Boolean(derived), seed: Boolean(seed) });
      }
    }
  }
}
try {
  await walk(staticRoot);
} catch (error) {
  line("rr01-bundle", { error: error instanceof Error ? error.name : "error" });
}
line("rr01-summary", { routeSecretHits: secretHits, bundleFiles, bundleHits });

// RR-02. Cookie forgery, replay, and cross-session. Do this before the IP bucket fills.
const fresh = newVisitorSession(Date.UTC(2026, 10, 11, 5, 0, 0));
const owner = newVisitorSession(Date.UTC(2026, 10, 11, 5, 0, 0));
owner.shares.push("4");
owner.records.push("3");
const freshCookie = cookieFor(fresh);
const ownerCookie = cookieFor(owner);
const tampered = ownerCookie.replace(".", ".x");
const blankSig = ownerCookie.slice(0, ownerCookie.lastIndexOf(".") + 1);

async function sign(cookie, body, extraHeaders = {}) {
  const headers = { "content-type": "application/json", ...extraHeaders };
  if (cookie) headers.cookie = cookie;
  const res = await call("/api/sign", { method: "POST", headers, body });
  return { status: res.status, body: redact(res.text).slice(0, 180), ...flags(res.text) };
}

const issued = await call("/api/demo/config");
const issuedCookie = issued.cookieNames.includes("rr_visitor")
  ? (issued.text, (await fetch(base + "/api/demo/config")).headers.getSetCookie?.() ?? []).find((item) => item.startsWith("rr_visitor="))?.split(";")[0] ?? ""
  : "";
const firstPayload = payloadOf(issuedCookie);
const again = await call("/api/demo/config", { headers: issuedCookie ? { cookie: issuedCookie } : {} });
const againCookie = (againCookieHeaders(again));

function againCookieHeaders(res) {
  return "";
}

line("rr02", {
  hasSessionSecret: Boolean(SESSION),
  anonymousRevoke: await sign("", { role: "patient", method: "revoke_share", args: { share_id: "999999" } }, { "x-vercel-forwarded-for": "198.51.100.40" }),
  garbageCookie: await sign("rr_visitor=not-a-token", { role: "patient", method: "revoke_share", args: { share_id: "1" } }),
  tamperedHmac: await sign(tampered, { role: "patient", method: "revoke_share", args: { share_id: "4" } }),
  emptySignature: await sign(blankSig, { role: "patient", method: "revoke_share", args: { share_id: "4" } }),
  wrongSecretMint: await sign(
    writeVisitorCookie(owner, "wrong-secret", false).split(";")[0],
    { role: "patient", method: "revoke_share", args: { share_id: "4" } },
  ),
  foreignRevoke: await sign(freshCookie, { role: "patient", method: "revoke_share", args: { share_id: "4" } }),
  foreignCreateShare: await sign(freshCookie, { role: "patient", method: "create_share", args: { record_id: "3" } }),
  numericShare: await sign(ownerCookie, { role: "patient", method: "revoke_share", args: { share_id: 4 } }),
  ownerRevokeReachesSigner: await sign(ownerCookie, { role: "patient", method: "revoke_share", args: { share_id: "4" } }),
  replaySameCookie: await sign(ownerCookie, { role: "patient", method: "revoke_share", args: { share_id: "4" } }),
  freshCreateRecord: await sign(freshCookie, { role: "clinic", method: "create_record", args: { patient: "rr-patient-6c9910d7.testnet", sections: [] } }),
  registerActor: await sign(freshCookie, { role: "patient", method: "register_actor", args: { account_id: "a" } }),
  fixationSid: firstPayload?.sid ? String(firstPayload.sid).slice(0, 4) : "",
});

const fixation = await fetch(base + "/api/demo/config");
const fixationCookie = (fixation.headers.getSetCookie?.() ?? []).find((item) => item.startsWith("rr_visitor="))?.split(";")[0] ?? "";
const sid1 = payloadOf(fixationCookie)?.sid ?? "";
const fixationAgain = await fetch(base + "/api/demo/config", { headers: { cookie: fixationCookie } });
const sid2 = payloadOf((fixationAgain.headers.getSetCookie?.() ?? []).find((item) => item.startsWith("rr_visitor="))?.split(";")[0] ?? "")?.sid ?? "";
const badPlant = await fetch(base + "/api/demo/config", { headers: { cookie: "rr_visitor=planted.bad" } });
const sid3 = payloadOf((badPlant.headers.getSetCookie?.() ?? []).find((item) => item.startsWith("rr_visitor="))?.split(";")[0] ?? "")?.sid ?? "";
line("rr02-fixation", {
  reusedValidSid: Boolean(sid1) && sid1 === sid2,
  rejectedPlantGetsNewSid: Boolean(sid3) && sid3 !== sid1,
});

// Proxy allowlist on a fresh bucket, including a local listener that must not be fetched.
{
  const http = await import("node:http");
  const hits = [];
  const listener = http.createServer((req, res) => {
    hits.push(req.url ?? "");
    res.writeHead(200);
    res.end("hit");
  });
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  const paths = [
    `/api/nearai/v1/attestation/report?next=http://127.0.0.1:${port}/`,
    `/api/nearai/v1/http://127.0.0.1:${port}/`,
    `/api/nearai/v1/model/..%2f..%2f`,
  ];
  const results = [];
  for (const pathName of paths) {
    const res = await call(pathName, { headers: { "x-vercel-forwarded-for": "198.51.100.61" } });
    results.push({ path: pathName.split("?")[0], status: res.status, snippet: redact(res.text).slice(0, 80), ...flags(res.text) });
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  listener.close();
  line("proxy-fresh", { results, listenerHits: hits.length });
}

// RR-03. Blob reads without a ticket, plus paths that are not the GET query.
const blobBody = new TextEncoder().encode("fictional-ciphertext-envelope-v1");
const put = await fetch(base + "/api/blob", { method: "PUT", body: blobBody });
const putText = await put.text();
let hash = "";
try {
  hash = JSON.parse(putText).hash ?? "";
} catch {
  hash = "";
}
const getPlain = await call("/api/blob?hash=" + hash);
const getFakeTicket = await call(`/api/blob?hash=${hash}&account_id=rr-hospital-b-6c9910d7.testnet&nonce=${"cd".repeat(32)}&share_id=1`);
const getHead = await call("/api/blob?hash=" + hash, { method: "HEAD" });
const getFile = await call("/.data/blobs/" + hash);
const getData = await call("/data/blobs/" + hash);
line("rr03", {
  putStatus: put.status,
  hashLen: hash.length,
  putEchoesBody: putText.includes("fictional-ciphertext-envelope-v1"),
  getStatus: getPlain.status,
  getMatches: getPlain.text === "fictional-ciphertext-envelope-v1",
  fakeTicketStatus: getFakeTicket.status,
  fakeTicketMatches: getFakeTicket.text === "fictional-ciphertext-envelope-v1",
  headStatus: getHead.status,
  staticDataStatus: getFile.status,
  publicDataStatus: getData.status,
  getFlags: flags(getPlain.text),
});

// RR-04. Extra forwarding headers on one local bucket. Runs last because it fills the bucket.
const headersToTry = [
  { "x-vercel-forwarded-for": "198.51.100.10" },
  { "x-vercel-forwarded-for": "198.51.100.11" },
  { "x-forwarded-for": "203.0.113.21" },
  { forwarded: "for=192.0.2.10" },
  { "x-real-ip": "192.0.2.55" },
  { "cf-connecting-ip": "192.0.2.56" },
  { "x-client-ip": "192.0.2.57" },
  { "true-client-ip": "192.0.2.58" },
];
const admitted = [];
for (const headers of headersToTry) {
  const res = await sign("", { role: "nope", method: "approve_share", args: {} }, headers);
  admitted.push(res.status);
}
const more = [];
for (let i = 0; i < 30; i += 1) {
  const res = await sign("", { role: "nope", method: "approve_share", args: {} }, { "x-vercel-forwarded-for": `198.51.100.${i + 1}` });
  more.push(res.status);
  if (res.status === 429 && more.filter((status) => status === 429).length >= 2) break;
}
line("rr04", {
  headerStatuses: admitted,
  rotatingForwarded: more,
  distinctNon429: new Set([...admitted, ...more].filter((status) => status !== 429)).size,
});
