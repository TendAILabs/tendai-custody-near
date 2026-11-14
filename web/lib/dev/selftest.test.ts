import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { memoryStore } from "../guard/visitor.ts";
import { publishCheck, type AttackCheck } from "./attack-checks.ts";
import { handleSelftest, secretEquals, selftestFailureMessage, SELFTEST_HEADER } from "./selftest.ts";

const TOKEN = "preview-selftest-token";

function call(token?: string): Request {
  const headers = new Headers();
  if (token !== undefined) headers.set(SELFTEST_HEADER, token);
  return new Request("https://demo.test/api/dev/selftest", { method: "POST", headers });
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

test("secret compare matches only the same bytes", () => {
  assert.equal(secretEquals(TOKEN, TOKEN), true);
  assert.equal(secretEquals("preview-selftest-tokem", TOKEN), false);
  assert.equal(secretEquals("short", TOKEN), false);
  assert.equal(secretEquals("", TOKEN), false);
});

test("selftest is 404 outside preview, including production", async () => {
  const previous = process.env.VERCEL_ENV;
  let ran = false;
  process.env.VERCEL_ENV = "production";
  process.env.RR_SELFTEST_TOKEN = TOKEN;
  try {
    const response = await handleSelftest(call(TOKEN), {
      run: async () => {
        ran = true;
        return [];
      },
      store: memoryStore({ isolated: true }),
    });
    assert.equal(response.status, 404);
    assert.equal(ran, false);
    delete process.env.VERCEL_ENV;
    const local = await handleSelftest(call(TOKEN), { store: memoryStore({ isolated: true }) });
    assert.equal(local.status, 404);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    delete process.env.RR_SELFTEST_TOKEN;
  }
});

test("selftest rejects a missing or wrong token and does not run checks", async () => {
  await withPreview(async () => {
    let ran = false;
    const run = async (): Promise<AttackCheck[]> => {
      ran = true;
      return [];
    };
    const missing = await handleSelftest(call(), { run, store: memoryStore({ isolated: true }) });
    assert.equal(missing.status, 401);
    const wrong = await handleSelftest(call("other-token-value"), { run, store: memoryStore({ isolated: true }) });
    assert.equal(wrong.status, 401);
    const body = await wrong.text();
    assert.equal(body.includes(TOKEN), false);
    assert.equal(ran, false);
  });
});

test("selftest returns names, pass, and tx only, and then limits", async () => {
  await withPreview(async () => {
    const store = memoryStore({ isolated: true });
    const now = Date.UTC(2026, 10, 11, 8, 0, 0);
    const sample: AttackCheck[] = [
      { name: "create_record", pass: true, tx: "7HPQpzf9MvJqEnt1MzwJ28qFtSV7vmRCo5t1XaL9yH8F", detail: "ed25519:secretvalueshouldnotleak" },
      { name: "unauthorized open", pass: true, detail: "ERR_UNAUTHORIZED" },
    ];
    const first = await handleSelftest(call(TOKEN), { run: async () => sample, now, store });
    assert.equal(first.status, 200);
    const body = (await first.json()) as { checks: Array<{ name: string; pass: boolean; tx?: string; detail?: string }> };
    assert.deepEqual(body.checks[0], publishCheck(sample[0]));
    assert.equal("detail" in body.checks[0], false);
    assert.equal(JSON.stringify(body).includes("ed25519"), false);
    assert.equal(JSON.stringify(body).includes(TOKEN), false);
    const second = await handleSelftest(call(TOKEN), { run: async () => sample, now: now + 1, store });
    assert.equal(second.status, 200);
    const third = await handleSelftest(call(TOKEN), { run: async () => sample, now: now + 2, store });
    assert.equal(third.status, 429);
  });
});

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

function callMethod(method: string, token?: string): Request {
  const headers = new Headers();
  if (token !== undefined) headers.set(SELFTEST_HEADER, token);
  return new Request("https://demo.test/api/dev/selftest", { method, headers });
}

test("every method is 404 outside preview and does not run checks", async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.RR_SELFTEST_TOKEN = TOKEN;
  try {
    for (const env of ["production", undefined] as const) {
      if (env === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = env;
      for (const method of METHODS) {
        let ran = false;
        const response = await handleSelftest(callMethod(method, TOKEN), {
          run: async () => {
            ran = true;
            return [];
          },
          store: memoryStore({ isolated: true }),
        });
        assert.equal(response.status, 404, `${env ?? "unset"} ${method}`);
        assert.equal(response.headers.get("cache-control"), "no-store");
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

test("preview still accepts only a posted token and leaves other methods at 405", async () => {
  await withPreview(async () => {
    let ran = false;
    const run = async (): Promise<AttackCheck[]> => {
      ran = true;
      return [];
    };
    for (const method of METHODS) {
      if (method === "POST") continue;
      const response = await handleSelftest(callMethod(method, TOKEN), {
        run,
        store: memoryStore({ isolated: true }),
      });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get("allow"), "POST");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(await response.text(), "");
    }
    assert.equal(ran, false);
    const missing = await handleSelftest(callMethod("POST"), { run, store: memoryStore({ isolated: true }) });
    assert.equal(missing.status, 401);
    const authed = await handleSelftest(callMethod("POST", TOKEN), {
      run: async () => {
        ran = true;
        return [];
      },
      store: memoryStore({ isolated: true }),
    });
    assert.equal(authed.status, 200);
    assert.equal(ran, true);
  });
});

test("production selftest GET, POST, and PUT return an empty 404 and do not run checks", async () => {
  const { GET, POST, PUT } = await import("../../app/api/dev/selftest/route.ts");
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  process.env.RR_SELFTEST_TOKEN = TOKEN;
  let ran = false;
  const deps = {
    ready: async () => {},
    run: async () => {
      ran = true;
      return [];
    },
    store: memoryStore({ isolated: true }),
  };
  try {
    for (const [method, handler] of [
      ["GET", GET],
      ["POST", POST],
      ["PUT", PUT],
    ] as const) {
      const response = await handler(callMethod(method, TOKEN), deps);
      assert.equal(response.status, 404, method);
      assert.equal(response.headers.get("allow"), null, method);
      assert.equal(await response.text(), "", method);
    }
    assert.equal(ran, false);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    delete process.env.RR_SELFTEST_TOKEN;
  }
});

test("production selftest is 404 for every method when the runner would throw", async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.RR_SELFTEST_TOKEN = TOKEN;
  try {
    for (const env of ["production", undefined] as const) {
      if (env === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = env;
      for (const method of METHODS) {
        const response = await handleSelftest(callMethod(method, TOKEN), {
          run: async () => {
            throw new Error("should not run");
          },
          store: memoryStore({ isolated: true }),
        });
        assert.equal(response.status, 404, `${env ?? "unset"} ${method}`);
        assert.equal(response.headers.get("allow"), null);
        assert.equal(await response.text(), "");
      }
    }
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    delete process.env.RR_SELFTEST_TOKEN;
  }
});

test("selftest failure text keeps a short message and drops secrets", () => {
  const secret = "selftest-message-secret-value";
  const previous = process.env.SELFTEST_LOG_PROBE;
  process.env.SELFTEST_LOG_PROBE = secret;
  try {
    assert.equal(selftestFailureMessage(new Error("no free record_id")), "no free record_id");
    assert.equal(selftestFailureMessage(new Error(`rpc ${secret}`)).includes(secret), false);
    assert.equal(selftestFailureMessage(new Error(`ed25519:${"C".repeat(44)}`)).includes("CCCC"), false);
    assert.equal(selftestFailureMessage(new Error('{"deidentified_text":"note"}')), "selftest failed");
    assert.equal(selftestFailureMessage("nope"), "selftest failed");
  } finally {
    if (previous === undefined) delete process.env.SELFTEST_LOG_PROBE;
    else process.env.SELFTEST_LOG_PROBE = previous;
  }
});

test("a thrown selftest logs the message only", async () => {
  const secret = "selftest-log-secret-value";
  const previous = process.env.SELFTEST_LOG_PROBE;
  process.env.SELFTEST_LOG_PROBE = secret;
  const lines: string[] = [];
  const original = console.log;
  console.log = (...parts: unknown[]) => {
    lines.push(parts.map((part) => String(part)).join(" "));
  };
  try {
    await withPreview(async () => {
      const response = await handleSelftest(call(TOKEN), {
        run: async () => {
          throw new Error(`view failed ${secret} ed25519:${"B".repeat(44)}`);
        },
        store: memoryStore({ isolated: true }),
      });
      assert.equal(response.status, 500);
      const body = await response.text();
      assert.equal(body.includes(secret), false);
      assert.equal(body.includes("ed25519:B"), false);
      assert.equal(body.includes(TOKEN), false);
      const logged = lines.filter((line) => line.includes("[selftest]"));
      assert.equal(logged.length, 1);
      assert.equal(logged[0]?.includes(secret), false);
      assert.equal(logged[0]?.includes("BBBB"), false);
      assert.match(logged[0] ?? "", /view failed/);
    });
  } finally {
    console.log = original;
    if (previous === undefined) delete process.env.SELFTEST_LOG_PROBE;
    else process.env.SELFTEST_LOG_PROBE = previous;
  }
});

test("the attack runner source does not sign with the owner key", () => {
  const source = readFileSync(new URL("./attack-checks.ts", import.meta.url), "utf8");
  assert.equal(source.includes("RELAY_OWNER_PRIVATE_KEY"), false);
  assert.equal(source.includes("CLINIC_A_FC_PRIVATE_KEY"), true);
  assert.equal(source.includes("DEMO_PATIENT_PRIVATE_KEY"), true);
});
