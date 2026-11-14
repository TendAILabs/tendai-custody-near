// Local next-start attacks. Fictional data and canary strings only.
// Usage: node docs/redteam/repros/http-attacks.mjs http://127.0.0.1:3210
// Prints statuses and booleans. Does not print secrets or canary values.

import { actorKeyPair } from "../../../web/lib/crypto/actor-key.ts";
import { decryptEnvelope, encryptEnvelope } from "../../../web/lib/crypto/envelope.ts";

const base = process.argv[2] ?? "http://127.0.0.1:3210";
const CANARY_MARK = "CANARY-SIGN-KEY";
const TEST_SEED = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function post(path, { headers = {}, body = {}, raw } = {}) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw ?? JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text };
}

async function get(path, headers = {}) {
  const response = await fetch(base + path, { headers });
  const text = await response.text();
  return { status: response.status, text };
}

function hasCanary(text) {
  return text.includes(CANARY_MARK);
}

const report = [];
function note(name, detail) {
  report.push({ name, ...detail });
  console.log(JSON.stringify({ name, ...detail }));
}

// 1. Demo config returns encryption secrets with no session.
{
  const res = await get("/api/demo/config");
  let parsed = null;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    parsed = null;
  }
  const enc = parsed?.enc ?? {};
  const roles = ["clinic", "patient", "hospital", "second", "app"];
  const lengths = Object.fromEntries(roles.map((role) => [role, typeof enc[role] === "string" ? enc[role].length : 0]));
  const hex64 = roles.every((role) => /^[0-9a-f]{64}$/.test(enc[role] ?? ""));
  const distinct = new Set(roles.map((role) => enc[role])).size;
  const local = actorKeyPair(TEST_SEED, parsed?.accounts?.patient ?? "rr-patient-6c9910d7.testnet");
  const remoteHex = enc.patient ?? "";
  const matchesLocalSecret = remoteHex === hex(local.secretKey);
  let roundtrip = false;
  if (matchesLocalSecret && parsed?.accounts?.patient) {
    const noteText = "Fictional note: chest tightness on stairs.";
    const envelope = encryptEnvelope({
      plaintext: new TextEncoder().encode(noteText),
      aad: "redteam|v1",
      recipients: [{ account_id: parsed.accounts.patient, publicKey: local.publicKey }],
    });
    const plain = decryptEnvelope({
      envelope,
      account_id: parsed.accounts.patient,
      secretKey: local.secretKey,
      expectedAad: "redteam|v1",
    });
    roundtrip = new TextDecoder().decode(plain) === noteText;
  }
  note("demo-config", {
    status: res.status,
    hex64,
    distinctSecrets: distinct,
    lengths,
    seedStringInBody: res.text.includes(TEST_SEED),
    returnedSecretMatchesSeed: matchesLocalSecret,
    decryptRoundtrip: roundtrip,
  });
}

// 2. Blob put/get with no ticket.
{
  const body = new TextEncoder().encode("fictional-ciphertext-envelope-v1");
  const put = await fetch(base + "/api/blob", { method: "PUT", body });
  const putText = await put.text();
  let hash = "";
  try {
    hash = JSON.parse(putText).hash ?? "";
  } catch {
    hash = "";
  }
  const got = await get("/api/blob?hash=" + hash);
  const traversal = await get("/api/blob?hash=../.env");
  const oversized = await fetch(base + "/api/blob", { method: "PUT", body: new Uint8Array(1_000_001) });
  note("blob-no-ticket", {
    putStatus: put.status,
    hashLen: hash.length,
    getStatus: got.status,
    getMatches: got.text === "fictional-ciphertext-envelope-v1",
    traversalStatus: traversal.status,
    oversizedStatus: oversized.status,
  });
}

// 3. Open without a ticket.
{
  const res = await post("/api/open", {
    body: {
      account_id: "rr-hospital-b-6c9910d7.testnet",
      nonce: "ab".repeat(32),
      share_id: "1",
    },
  });
  note("open-without-ticket", { status: res.status, bodyHasEnvelope: res.text.includes("envelopes") });
}

// 4. Per-IP limit and header spoofing, on /api/sign so the daily AI counter stays unused.
{
  const ip = "198.51.100.10";
  const statuses = [];
  for (let i = 0; i < 26; i += 1) {
    const res = await post("/api/sign", {
      headers: { "x-vercel-forwarded-for": ip },
      body: { role: "nope", method: "approve_share", args: {} },
    });
    statuses.push(res.status);
  }
  const rotated = await post("/api/sign", {
    headers: { "x-vercel-forwarded-for": "198.51.100.11" },
    body: { role: "nope", method: "approve_share", args: {} },
  });
  const forwardedOnly = await post("/api/sign", {
    headers: { "x-forwarded-for": "203.0.113.21" },
    body: { role: "patient", method: "revoke_share", args: { share_id: "1" } },
  });
  const realIpOnly = await post("/api/sign", {
    headers: { "x-real-ip": "203.0.113.77" },
    body: { role: "nope", method: "approve_share", args: {} },
  });
  const realIpAgain = await post("/api/sign", {
    headers: { "x-real-ip": "203.0.113.78" },
    body: { role: "nope", method: "approve_share", args: {} },
  });
  note("ip-spoof", {
    first24: statuses.slice(0, 24).every((status) => status !== 429),
    call25: statuses[24],
    call26: statuses[25],
    rotatedIpStatus: rotated.status,
    xForwardedForStatus: forwardedOnly.status,
    xForwardedForLeaksCanary: hasCanary(forwardedOnly.text),
    xRealIpFirst: realIpOnly.status,
    xRealIpSecondDistinct: realIpAgain.status,
  });
}

// 5. Sign route does not authenticate and does not echo the canary key.
{
  const res = await post("/api/sign", {
    headers: { "x-vercel-forwarded-for": "198.51.100.40" },
    body: { role: "patient", method: "revoke_share", args: { share_id: "999999" } },
  });
  note("sign-patient-revoke", {
    status: res.status,
    body: res.text.slice(0, 180),
    leaksCanary: hasCanary(res.text),
  });
  const bad = await post("/api/sign", {
    headers: { "x-vercel-forwarded-for": "198.51.100.41" },
    body: { role: "patient", method: "register_actor", args: { account_id: "a" } },
  });
  note("sign-method-allowlist", { status: bad.status, body: bad.text.slice(0, 120) });
}

// 6. Summary input cap, empty body, and a large payload. No upstream key on this server.
{
  const empty = await post("/api/tee/summary", {
    headers: { "x-vercel-forwarded-for": "198.51.100.50" },
    body: { chart: "   " },
  });
  const big = "Fictional chart. ".repeat(2000);
  const sized = await post("/api/tee/summary", {
    headers: { "x-vercel-forwarded-for": "198.51.100.51" },
    body: { chart: big },
  });
  note("summary-validation", {
    emptyStatus: empty.status,
    emptyBody: empty.text.slice(0, 160),
    chartChars: big.length,
    sizedStatus: sized.status,
    sizedBody: sized.text.slice(0, 200),
    sizedLeaksCanary: hasCanary(sized.text),
  });
}

// 7. Proxy allowlist, session gate, and a local listener that must not be fetched.
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
  const session = process.env.REDTEAM_SESSION ?? "";
  const paths = [
    `/api/nearai/v1/attestation/report?next=http://127.0.0.1:${port}/`,
    `/api/nearai/v1/chat/completions`,
    `/api/nearai/v1/http://127.0.0.1:${port}/`,
    `/api/nearai/v1/model/..%2f..%2f`,
  ];
  const results = [];
  for (const path of paths) {
    const headers = {};
    if (session && path.includes("chat/completions")) headers.authorization = `Bearer ${session}`;
    const res = path.includes("chat/completions")
      ? await post(path, {
          headers: { ...headers, "x-vercel-forwarded-for": "198.51.100.60" },
          body: { model: "z-ai/glm-5.3-flash", messages: [{ role: "user", content: "ping" }] },
        })
      : await get(path, { "x-vercel-forwarded-for": "198.51.100.61" });
    results.push({ path: path.split("?")[0], status: res.status, snippet: res.text.slice(0, 80) });
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  listener.close();
  note("proxy", { results, listenerHits: hits.length });
}

// 8. Daily AI cap: parallel burst, then sequential until the daily 429, counting admits.
{
  const burstN = 80;
  const burst = await Promise.all(
    Array.from({ length: burstN }, (_, i) =>
      post("/api/tee/summary", {
        headers: { "x-vercel-forwarded-for": `203.0.113.${(i % 200) + 1}` },
        body: { chart: "Fictional referral note. No identifiers." },
      }),
    ),
  );
  const burstPass = burst.filter((res) => res.status !== 429).length;
  const burstDaily = burst.filter((res) => res.text.includes("NEAR AI calls for today")).length;
  let sequentialPass = 0;
  let sequentialDaily = 0;
  let firstDailyBody = "";
  for (let i = 0; i < 340; i += 1) {
    const octet3 = 20 + Math.floor(i / 200);
    const octet4 = (i % 200) + 1;
    const res = await post("/api/tee/summary", {
      headers: { "x-vercel-forwarded-for": `198.51.${octet3}.${octet4}` },
      body: { chart: "Fictional referral note. No identifiers." },
    });
    if (res.status === 429 && res.text.includes("NEAR AI calls for today")) {
      sequentialDaily += 1;
      firstDailyBody = res.text.slice(0, 180);
      break;
    }
    if (res.status !== 429) sequentialPass += 1;
  }
  note("daily-cap", {
    burstN,
    burstPass,
    burstDaily,
    sequentialPassBeforeDaily429: sequentialPass,
    sawDaily429: sequentialDaily === 1,
    totalPassedBeforeDaily429: burstPass + sequentialPass,
    firstDailyBody,
  });
}
