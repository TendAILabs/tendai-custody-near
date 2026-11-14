import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { handleDemoConfig } from "./config-handler.ts";
import {
  admitDemoConfig,
  DEMO_CONFIG_CLIENT_LIMIT,
  DEMO_CONFIG_GLOBAL_KEY,
  DEMO_CONFIG_GLOBAL_LIMIT,
  demoConfigClientAddress,
  demoConfigStorageKey,
} from "./config-limit.ts";

const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const SECRET = "test-session-secret";
const ACCOUNTS = {
  clinic: "rr-clinic-a-6c9910d7.testnet",
  patient: "rr-patient-6c9910d7.testnet",
  hospital: "rr-hospital-b-6c9910d7.testnet",
  second: "rr-second-6c9910d7.testnet",
  app: "rr-pulsefit-6c9910d7.testnet",
};

function configRequest(headers: Record<string, string>): Request {
  return new Request("https://demo.test/api/demo/config", { headers });
}

test("demo config limits each client and stores a hash of the address", async () => {
  const previous = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    const spoofed = configRequest({ "x-real-ip": "198.51.100.8", "x-forwarded-for": "203.0.113.9" });
    const other = configRequest({ "x-real-ip": "198.51.100.9", "x-forwarded-for": "203.0.113.9" });
    assert.equal(demoConfigClientAddress(spoofed), "local");
    assert.equal(demoConfigClientAddress(other), "local");
    process.env.VERCEL = "1";
    const left = configRequest({
      "x-real-ip": "198.51.100.8",
      "x-forwarded-for": "203.0.113.9, 198.51.100.50",
    });
    const leftAgain = configRequest({
      "x-real-ip": "198.51.100.8",
      "x-forwarded-for": "192.0.2.10, 203.0.113.4",
    });
    const right = configRequest({ "x-real-ip": "198.51.100.9" });
    assert.equal(demoConfigClientAddress(left), "198.51.100.8");
    assert.equal(demoConfigClientAddress(leftAgain), demoConfigClientAddress(left));
    assert.notEqual(demoConfigClientAddress(right), demoConfigClientAddress(left));
    const forwarded = configRequest({ "x-forwarded-for": "203.0.113.5, 198.51.100.8" });
    assert.equal(demoConfigClientAddress(forwarded), "203.0.113.5");
    const digest = createHash("sha256").update("198.51.100.8").digest("hex");
    assert.equal(demoConfigStorageKey("198.51.100.8"), `demo-config:${digest}`);
    assert.equal(demoConfigStorageKey("198.51.100.8").includes("198.51.100.8"), false);

    const buckets = new Map<string, number[]>();
    const deps = {
      now: NOW,
      buckets,
      secret: SECRET,
      config: { contractId: "rr6c9910d7.testnet", accounts: ACCOUNTS },
    };
    for (let i = 0; i < DEMO_CONFIG_CLIENT_LIMIT; i += 1) {
      const response = await handleDemoConfig(left, deps);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("set-cookie"), null);
    }
    const blocked = await handleDemoConfig(leftAgain, deps);
    const blockedBody = (await blocked.json()) as { error?: string };
    assert.equal(blocked.status, 429);
    assert.equal(blockedBody.error, "rate limit");
    assert.equal(blocked.headers.get("set-cookie"), null);
    const neighbor = await handleDemoConfig(right, deps);
    assert.equal(neighbor.status, 200);
    const keys = [...buckets.keys()];
    assert.equal(keys.includes(DEMO_CONFIG_GLOBAL_KEY), true);
    assert.equal(keys.some((key) => key.includes("198.51.100.8") || key.includes("198.51.100.9")), false);
    assert.equal(buckets.get(demoConfigStorageKey("198.51.100.8"))?.length, DEMO_CONFIG_CLIENT_LIMIT);
    assert.equal(buckets.get(DEMO_CONFIG_GLOBAL_KEY)?.length, DEMO_CONFIG_CLIENT_LIMIT + 1);
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("the shared demo config cap still blocks a new client", () => {
  const buckets = new Map<string, number[]>();
  const ips = ["198.51.100.1", "198.51.100.2", "198.51.100.3"];
  for (const ip of ips) {
    for (let i = 0; i < DEMO_CONFIG_CLIENT_LIMIT; i += 1) {
      assert.equal(admitDemoConfig(ip, NOW, buckets), true);
    }
  }
  assert.equal(buckets.get(DEMO_CONFIG_GLOBAL_KEY)?.length, DEMO_CONFIG_GLOBAL_LIMIT);
  assert.equal(admitDemoConfig("198.51.100.4", NOW, buckets), false);
  assert.equal(buckets.get(demoConfigStorageKey("198.51.100.4")), undefined);
  assert.equal(admitDemoConfig("198.51.100.1", NOW, buckets), false);
  assert.equal(buckets.get(DEMO_CONFIG_GLOBAL_KEY)?.length, DEMO_CONFIG_GLOBAL_LIMIT);
  assert.equal(buckets.get(demoConfigStorageKey("198.51.100.1"))?.length, DEMO_CONFIG_CLIENT_LIMIT);
});
