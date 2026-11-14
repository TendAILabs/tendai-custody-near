import assert from "node:assert/strict";
import { test } from "node:test";
import { KeyPair } from "near-api-js";
import { memoryStore } from "../guard/visitor.ts";
import { handleAttackDemo } from "./attack-demo.ts";
import type { AttackReport } from "./attack-checks.ts";
import { SELFTEST_HEADER } from "./selftest.ts";

const TOKEN = "preview-attack-demo-token";
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const KEY_NAMES = ["CLINIC_A_FC_PRIVATE_KEY", "HOSPITAL_B_FC_PRIVATE_KEY", "DEMO_PATIENT_PRIVATE_KEY"] as const;
const ACCOUNT_NAMES = ["CLINIC_A_ACCOUNT_ID", "HOSPITAL_B_ACCOUNT_ID", "DEMO_PATIENT_ACCOUNT_ID"] as const;

function call(method: string, token?: string): Request {
  const headers = new Headers();
  if (token !== undefined) headers.set(SELFTEST_HEADER, token);
  return new Request("https://demo.test/api/dev/attack-demo", { method, headers });
}

async function withPreview<T>(run: () => Promise<T>): Promise<T> {
  const previousEnv = process.env.VERCEL_ENV;
  const previousToken = process.env.RR_SELFTEST_TOKEN;
  process.env.VERCEL_ENV = "preview";
  process.env.RR_SELFTEST_TOKEN = TOKEN;
  try {
    return await run();
  } finally {
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
    if (previousToken === undefined) delete process.env.RR_SELFTEST_TOKEN;
    else process.env.RR_SELFTEST_TOKEN = previousToken;
  }
}

test("attack demo rejects a missing or wrong token and does not run", async () => {
  await withPreview(async () => {
    let ran = false;
    const deps = {
      run: async (): Promise<AttackReport> => {
        ran = true;
        return { checks: [] };
      },
      signers: () => {
        ran = true;
        return [];
      },
      store: memoryStore({ isolated: true }),
    };
    const missing = await handleAttackDemo(call("POST"), deps);
    assert.equal(missing.status, 401);
    const wrong = await handleAttackDemo(call("POST", "other-token-value"), deps);
    assert.equal(wrong.status, 401);
    const body = await wrong.text();
    assert.equal(body.includes(TOKEN), false);
    assert.equal(ran, false);
  });
});

test("production attack demo and selftest GET, POST, and PUT return an empty 404", async () => {
  const attack = await import("../../app/api/dev/attack-demo/route.ts");
  const selftest = await import("../../app/api/dev/selftest/route.ts");
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  process.env.RR_SELFTEST_TOKEN = TOKEN;
  let ran = false;
  const attackDeps = {
    ready: async () => {},
    run: async () => {
      ran = true;
      return { checks: [] };
    },
    signers: () => {
      ran = true;
      return [];
    },
    store: memoryStore({ isolated: true }),
  };
  const selftestDeps = {
    ready: async () => {},
    run: async () => {
      ran = true;
      return [];
    },
    store: memoryStore({ isolated: true }),
  };
  try {
    for (const method of ["GET", "POST", "PUT"] as const) {
      const attackResponse = await attack[method](call(method, TOKEN), attackDeps);
      assert.equal(attackResponse.status, 404, `attack ${method}`);
      assert.equal(attackResponse.headers.get("allow"), null, `attack ${method}`);
      assert.equal(await attackResponse.text(), "", `attack ${method}`);
      const selftestResponse = await selftest[method](call(method, TOKEN), selftestDeps);
      assert.equal(selftestResponse.status, 404, `selftest ${method}`);
      assert.equal(selftestResponse.headers.get("allow"), null, `selftest ${method}`);
      assert.equal(await selftestResponse.text(), "", `selftest ${method}`);
    }
    assert.equal(ran, false);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    delete process.env.RR_SELFTEST_TOKEN;
  }
});

test("attack demo is an empty 404 for every method outside preview", async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.RR_SELFTEST_TOKEN = TOKEN;
  try {
    for (const env of ["production", undefined] as const) {
      if (env === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = env;
      for (const method of METHODS) {
        let ran = false;
        const response = await handleAttackDemo(call(method, TOKEN), {
          run: async () => {
            ran = true;
            return { checks: [] };
          },
          signers: () => {
            ran = true;
            return [];
          },
          store: memoryStore({ isolated: true }),
        });
        assert.equal(response.status, 404, `${env ?? "unset"} ${method}`);
        assert.equal(response.headers.get("allow"), null);
        assert.equal(await response.text(), "");
        assert.equal(ran, false);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    delete process.env.RR_SELFTEST_TOKEN;
  }
});

test("attack demo returns pass, tx, and signer public keys without key material", async () => {
  const pairs = KEY_NAMES.map(() => KeyPair.fromRandom("ed25519"));
  const secrets = pairs.map((pair) => pair.toString());
  const publics = pairs.map((pair) => pair.getPublicKey().toString());
  const accounts = ["clinic-a.synthetic.test", "hospital-b.synthetic.test", "patient.synthetic.test"];
  const previous = Object.fromEntries(
    [...KEY_NAMES, ...ACCOUNT_NAMES, "RELAY_CONTRACT_ID"].map((name) => [name, process.env[name]]),
  );
  for (const [index, name] of KEY_NAMES.entries()) process.env[name] = secrets[index];
  for (const [index, name] of ACCOUNT_NAMES.entries()) process.env[name] = accounts[index];
  process.env.RELAY_CONTRACT_ID = "rr6c9910d7.testnet";
  const tx = "7HPQpzf9MvJqEnt1MzwJ28qFtSV7vmRCo5t1XaL9yH8F";
  try {
    await withPreview(async () => {
      const store = memoryStore({ isolated: true });
      const now = Date.UTC(2026, 10, 14, 5, 0, 0);
      let runs = 0;
      const run = async (): Promise<AttackReport> => {
        runs += 1;
        return {
          checks: [
            { name: "create_record", pass: true, tx, detail: secrets[0] },
            { name: "unauthorized open", pass: true, detail: "ERR_UNAUTHORIZED" },
          ],
        };
      };
      const first = await handleAttackDemo(call("POST", TOKEN), { run, now, store });
      assert.equal(first.status, 200);
      const body = (await first.json()) as {
        contract?: string;
        signers?: { role: string; accountId: string; publicKey: string }[];
        checks?: { name: string; pass: boolean; tx?: string; detail?: string }[];
      };
      assert.equal(body.contract, "rr6c9910d7.testnet");
      assert.deepEqual(
        body.signers?.map((signer) => signer.publicKey),
        publics,
      );
      assert.deepEqual(
        body.signers?.map((signer) => signer.accountId),
        accounts,
      );
      assert.equal(body.checks?.[0]?.pass, true);
      assert.equal(body.checks?.[0]?.tx, tx);
      assert.equal(body.checks?.[0]?.detail, undefined);
      assert.equal(body.checks?.[1]?.pass, true);
      const serialized = JSON.stringify(body);
      for (const secret of secrets) assert.equal(serialized.includes(secret), false);
      assert.equal(serialized.includes(TOKEN), false);
      const second = await handleAttackDemo(call("POST", TOKEN), { run, now: now + 1, store });
      assert.equal(second.status, 200);
      const third = await handleAttackDemo(call("POST", TOKEN), { run, now: now + 2, store });
      assert.equal(third.status, 429);
      assert.equal(runs, 2);
    });
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
