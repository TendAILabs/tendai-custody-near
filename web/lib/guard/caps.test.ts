import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { configuredCap } from "./cap.ts";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("a cap env falls back unless it is a positive integer in range", () => {
  assert.equal(configuredCap(undefined, 48), 48);
  assert.equal(configuredCap("  ", 48), 48);
  assert.equal(configuredCap("0", 48), 48);
  assert.equal(configuredCap("-3", 48), 48);
  assert.equal(configuredCap("2.5", 48), 48);
  assert.equal(configuredCap("nope", 48), 48);
  assert.equal(configuredCap("100001", 48), 48);
  assert.equal(configuredCap("48", 12), 48);
});

test("limit env vars override the published defaults and name a retry time", () => {
  const script = `
    const { admit, memoryStore, ipCallLimit, signDayLimit, aiDayLimit } = await import("./lib/guard/visitor.ts");
    const { admitDemoSession, admitFaucet, faucetDayLimit, demoSessionIpLimit } = await import("./lib/visitor/limits.ts");
    if (ipCallLimit() !== 2) throw new Error("ip " + ipCallLimit());
    if (signDayLimit() !== 3) throw new Error("sign " + signDayLimit());
    if (aiDayLimit() !== 4) throw new Error("ai " + aiDayLimit());
    if (faucetDayLimit() !== 2) throw new Error("faucet " + faucetDayLimit());
    if (demoSessionIpLimit() !== 2) throw new Error("demo " + demoSessionIpLimit());
    const now = Date.UTC(2026, 10, 10, 12, 0, 0);
    const store = memoryStore({ isolated: true });
    if (!(await admit({ ip: "203.0.113.8", kind: "sign", now, store })).ok) throw new Error("first");
    if (!(await admit({ ip: "203.0.113.8", kind: "sign", now: now + 1, store })).ok) throw new Error("second");
    const blocked = await admit({ ip: "203.0.113.8", kind: "sign", now: now + 2, store });
    if (blocked.ok) throw new Error("expected block");
    if (!/Try again after .+ UTC/.test(blocked.error)) throw new Error(blocked.error);
    const signs = memoryStore({ isolated: true });
    for (let i = 0; i < 3; i += 1) {
      if (!(await admit({ ip: "198.51.100." + i, kind: "sign", now: now + i, store: signs })).ok) throw new Error("sign day " + i);
    }
    const day = await admit({ ip: "198.51.100.9", kind: "sign", now: now + 3, store: signs });
    if (day.ok || !/signed calls/.test(day.error) || !/Try again after/.test(day.error)) throw new Error(day.ok ? "open" : day.error);
    const demo = memoryStore({ isolated: true });
    if (!(await admitDemoSession(demo, "203.0.113.10", now)).ok) throw new Error("demo 1");
    if (!(await admitDemoSession(demo, "203.0.113.10", now + 1)).ok) throw new Error("demo 2");
    const demoBlocked = await admitDemoSession(demo, "203.0.113.10", now + 2);
    if (demoBlocked.ok || !/Try again after/.test(demoBlocked.error)) throw new Error("demo block");
    const faucet = memoryStore({ isolated: true });
    if (!(await admitFaucet(faucet, "203.0.113.20", now)).ok) throw new Error("faucet 1");
    if (!(await admitFaucet(faucet, "203.0.113.21", now + 1)).ok) throw new Error("faucet 2");
    const faucetBlocked = await admitFaucet(faucet, "203.0.113.22", now + 2);
    if (faucetBlocked.ok || !/Try again after/.test(faucetBlocked.error)) throw new Error("faucet block");
  `;
  const run = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script],
    {
      cwd: webRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        RR_IP_CALL_LIMIT: "2",
        RR_SIGN_DAY_LIMIT: "3",
        RR_AI_DAY_LIMIT: "4",
        RR_FAUCET_DAY_LIMIT: "2",
        RR_DEMO_SESSION_IP_LIMIT: "2",
      },
    },
  );
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});
