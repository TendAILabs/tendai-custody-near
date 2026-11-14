import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_DAY_LIMIT, SIGN_DAY_LIMIT, admit, cacheBackedStore, clientIp, dayUsage, guardRequest, IP_LIMIT, memoryStore, refundAdmission } from "./visitor.ts";

delete process.env.RR_IP_CALL_LIMIT;
delete process.env.RR_SIGN_DAY_LIMIT;
delete process.env.RR_AI_DAY_LIMIT;

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);

function request(ip: string): Request {
  return new Request("https://demo.test/api/tee/summary", {
    method: "POST",
    headers: { "x-real-ip": ip, "x-forwarded-for": "203.0.113.99", "x-vercel-forwarded-for": "198.51.100.50, 203.0.113.7" },
  });
}

test("the call after the per-IP limit returns 429 with a retry time", async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const store = memoryStore({ isolated: true });
    const incoming = request("198.51.100.8");
    for (let i = 0; i < IP_LIMIT; i += 1) {
      const allowed = await guardRequest(incoming, "sign", { store, now: NOW + i });
      assert.equal(allowed, null);
    }
    const blocked = await guardRequest(incoming, "sign", { store, now: NOW + IP_LIMIT });
    assert.ok(blocked);
    assert.equal(blocked.status, 429);
    const body = (await blocked.json()) as { error?: string; retryAt?: string };
    assert.match(body.error ?? "", /Too many tries from this network/);
    assert.match(body.error ?? "", /Try again after/);
    assert.match(body.error ?? "", /UTC/);
    assert.equal(blocked.headers.get("retry-after") !== null, true);
    assert.equal(typeof body.retryAt, "string");
    assert.equal(await guardRequest(incoming, "ai", { store, now: NOW + IP_LIMIT + 1 }), null);
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("a second visitor is not blocked by the first IP", async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  const store = memoryStore({ isolated: true });
  for (let i = 0; i < IP_LIMIT; i += 1) {
    assert.equal(await guardRequest(request("198.51.100.8"), "sign", { store, now: NOW }), null);
  }
  assert.equal(await guardRequest(request("198.51.100.9"), "sign", { store, now: NOW }), null);
  if (previous === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previous;
});

test("L2 signing does not burn the AI day quota", async () => {
  const signs = memoryStore({ isolated: true });
  for (let i = 0; i < SIGN_DAY_LIMIT; i += 1) {
    const result = await admit({ ip: `203.0.113.${i % 200}`, kind: "sign", now: NOW + i, store: signs });
    assert.equal(result.ok, true);
  }
  const signed = await admit({ ip: "203.0.113.250", kind: "sign", now: NOW + SIGN_DAY_LIMIT, store: signs });
  assert.equal(signed.ok, false);
  if (!signed.ok) assert.match(signed.error, /signed calls/);
  const aiAfterSigns = await admit({ ip: "203.0.113.251", kind: "ai", now: NOW + SIGN_DAY_LIMIT + 1, store: signs });
  assert.equal(aiAfterSigns.ok, true);
  const ai = memoryStore({ isolated: true });
  for (let i = 0; i < AI_DAY_LIMIT; i += 1) {
    assert.equal((await admit({ ip: `198.51.100.${i % 200}`, kind: "ai", now: NOW + i, store: ai })).ok, true);
  }
  const blocked = await admit({ ip: "198.51.100.9", kind: "ai", now: NOW + AI_DAY_LIMIT, store: ai });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.status, 429);
    assert.match(blocked.error, /NEAR AI calls for today/);
  }
  const signAfterAi = await admit({ ip: "198.51.100.10", kind: "sign", now: NOW + AI_DAY_LIMIT + 1, store: ai });
  assert.equal(signAfterAi.ok, true);
});

test("RR-04 a forwarded header does not choose the rate-limit bucket off Vercel", () => {
  const previous = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    const spoofed = new Request("https://demo.test/api/sign", {
      headers: { "x-forwarded-for": "203.0.113.9", "x-vercel-forwarded-for": "198.51.100.4", "x-real-ip": "192.0.2.10" },
    });
    assert.equal(clientIp(spoofed), "local");
    assert.equal(clientIp(new Request("https://demo.test/api/sign")), "local");
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("RR-04 on Vercel the bucket is x-real-ip, not a rotating forwarded hop", () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const left = new Request("https://demo.test/api/sign", {
      headers: {
        "x-forwarded-for": "203.0.113.9",
        "x-vercel-forwarded-for": "198.51.100.50",
        "x-real-ip": "192.0.2.10",
      },
    });
    const right = new Request("https://demo.test/api/sign", {
      headers: {
        "x-forwarded-for": "198.51.100.4",
        "x-vercel-forwarded-for": "203.0.113.77",
        "x-real-ip": "192.0.2.10",
      },
    });
    assert.equal(clientIp(left), "192.0.2.10");
    assert.equal(clientIp(right), clientIp(left));
    const fallback = new Request("https://demo.test/api/sign", {
      headers: { "x-vercel-forwarded-for": "198.51.100.50, 203.0.113.7", "x-forwarded-for": "192.0.2.10" },
    });
    assert.equal(clientIp(fallback), "203.0.113.7");
    assert.equal(clientIp(new Request("https://demo.test/api/sign", { headers: { "x-forwarded-for": "198.51.100.4" } })), "unknown");
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("RR-04 a dropped runtime cache write still limits this instance", async () => {
  const cache = {
    async get() {
      return null;
    },
    async set() {
      return undefined;
    },
  };
  const store = cacheBackedStore(cache);
  for (let i = 0; i < IP_LIMIT; i += 1) {
    const result = await admit({ ip: "198.51.100.8", kind: "sign", now: NOW + i, store });
    assert.equal(result.ok, true);
  }
  const blocked = await admit({ ip: "198.51.100.8", kind: "sign", now: NOW + IP_LIMIT, store });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.error, /Too many tries from this network/);
});

test("RR-04 a second instance does not see a dropped cache write", async () => {
  const cache = {
    async get() {
      return null;
    },
    async set() {
      return undefined;
    },
  };
  const left = cacheBackedStore(cache);
  const right = cacheBackedStore(cache);
  for (let i = 0; i < IP_LIMIT; i += 1) {
    assert.equal((await admit({ ip: "198.51.100.8", kind: "sign", now: NOW + i, store: left })).ok, true);
  }
  assert.equal((await admit({ ip: "198.51.100.8", kind: "sign", now: NOW + IP_LIMIT, store: right })).ok, true);
});

test("RR-04 a cache that keeps writes is shared, and each write has its own name", async () => {
  const data = new Map<string, unknown>();
  const names: string[] = [];
  const cache = {
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async set(key: string, value: unknown, options?: { name?: string }) {
      names.push(options?.name ?? "");
      data.set(key, value);
    },
  };
  const left = cacheBackedStore(cache);
  const right = cacheBackedStore(cache);
  for (let i = 0; i < IP_LIMIT; i += 1) {
    assert.equal((await admit({ ip: "198.51.100.8", kind: "sign", now: NOW + i, store: left })).ok, true);
  }
  const blocked = await admit({ ip: "198.51.100.8", kind: "sign", now: NOW + IP_LIMIT, store: right });
  assert.equal(blocked.ok, false);
  assert.equal(names.includes("visitor-limit"), false);
  assert.equal(names.includes("ip:sign:198.51.100.8"), true);
  assert.equal(names.includes("day:sign:2026-11-10"), true);
});

test("RR-05 two limiter stores share one budget", async () => {
  const now = Date.UTC(2026, 10, 11, 6, 0, 0);
  const left = memoryStore();
  const right = memoryStore();
  const burst = Math.ceil(AI_DAY_LIMIT / 2) + 30;
  const [leftRuns, rightRuns] = await Promise.all([
    Promise.all(Array.from({ length: burst }, (_, i) => admit({ ip: `203.0.113.${i % 200}`, kind: "ai", now: now + i, store: left }))),
    Promise.all(Array.from({ length: burst }, (_, i) => admit({ ip: `198.51.100.${i % 200}`, kind: "ai", now: now + i, store: right }))),
  ]);
  const passed = leftRuns.filter((result) => result.ok).length + rightRuns.filter((result) => result.ok).length;
  assert.equal(passed <= AI_DAY_LIMIT, true);
});

test("RR-05 concurrent daily admits stop at the cap", async () => {
  const store = memoryStore({ isolated: true });
  const results = await Promise.all(
    Array.from({ length: AI_DAY_LIMIT + 40 }, (_, i) => admit({ ip: `203.0.113.${i % 200}`, kind: "ai", now: NOW + (i % 50), store })),
  );
  const passed = results.filter((result) => result.ok).length;
  assert.equal(passed, AI_DAY_LIMIT);
  const follow = await admit({ ip: "198.51.100.9", kind: "ai", now: NOW + 1000, store });
  assert.equal(follow.ok, false);
  const signed = await admit({ ip: "198.51.100.10", kind: "sign", now: NOW + 1001, store });
  assert.equal(signed.ok, true);
});

test("a release returns one daily unit and does not grant a free one", async () => {
  const store = memoryStore({ isolated: true });
  const ip = "203.0.113.10";
  await refundAdmission({ ip, kind: "ai", now: NOW, store });
  assert.equal(await dayUsage("ai", NOW, store), 0);
  assert.equal((await admit({ ip, kind: "ai", now: NOW, store })).ok, true);
  assert.equal(await dayUsage("ai", NOW, store), 1);
  await refundAdmission({ ip, kind: "ai", now: NOW, store });
  assert.equal(await dayUsage("ai", NOW, store), 0);
  assert.equal(await dayUsage("sign", NOW, store), 0);
});

test("a release frees the matching IP stamp", async () => {
  const store = memoryStore({ isolated: true });
  const ip = "203.0.113.11";
  for (let i = 0; i < IP_LIMIT; i += 1) {
    assert.equal((await admit({ ip, kind: "ai", now: NOW + i, store })).ok, true);
  }
  assert.equal((await admit({ ip, kind: "ai", now: NOW + IP_LIMIT, store })).ok, false);
  await refundAdmission({ ip, kind: "ai", now: NOW + IP_LIMIT - 1, store });
  assert.equal((await admit({ ip, kind: "ai", now: NOW + IP_LIMIT, store })).ok, true);
  assert.equal(await dayUsage("ai", NOW, store), IP_LIMIT);
});

test("same-millisecond requests cannot pass the IP limit", async () => {
  const store = memoryStore({ isolated: true });
  const results = await Promise.all(
    Array.from({ length: IP_LIMIT + 8 }, () => admit({ ip: "198.51.100.30", kind: "sign", now: NOW, store })),
  );
  assert.equal(results.filter((result) => result.ok).length, IP_LIMIT);
});
