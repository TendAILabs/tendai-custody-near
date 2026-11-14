import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryStore } from "../guard/visitor.ts";
import { newVisitorSession, readVisitorSession, rememberChallenge, writeVisitorCookie } from "../session/visitor.ts";
import { CHALLENGE_IP_LIMIT, FAUCET_DAY_LIMIT, FAUCET_FLOOR_YOCTO, FAUCET_IP_LIMIT, FAUCET_TRANSFER_YOCTO, faucetDayUsage, faucetStore } from "./limits.ts";

delete process.env.RR_FAUCET_DAY_LIMIT;
import { attachFundingTx, beginFunding } from "./funding.ts";
import { handleVisitorStart, implicitAccountId } from "./start.ts";
import { handleVisitorBind, handleVisitorChallenge, LOGIN_MESSAGE } from "./bind.ts";
import { statusFor, DEMO_SIGNER_LABEL, LOCAL_SIGNER_LABEL } from "./status.ts";

const SECRET = "test-session-secret";
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const PUBLIC = "ab".repeat(32);
const ENC = "cd".repeat(32);
const SIGNATURE = Buffer.alloc(64, 7).toString("base64");

function startBody(publicKey: string): string {
  return JSON.stringify({ publicKey, encPubkey: ENC, signature: SIGNATURE });
}

function cookie(exp = NOW + 10 * 60 * 1000): string {
  const session = newVisitorSession(NOW);
  rememberChallenge(session, Buffer.alloc(32, 9).toString("base64url"), exp);
  return writeVisitorCookie(session, SECRET, false).split(";")[0] ?? "";
}

test("implicit account ids are 64 hex and nothing else", () => {
  assert.equal(implicitAccountId(PUBLIC), PUBLIC);
  assert.equal(implicitAccountId("AB".repeat(32)), PUBLIC);
  assert.equal(implicitAccountId("zz".repeat(32)), null);
  assert.equal(implicitAccountId(PUBLIC.slice(1)), null);
});

test("visitor start checks origin and content type before the faucet", async () => {
  const deps = {
    now: NOW,
    secret: SECRET,
    configured: false,
    store: memoryStore({ isolated: true }),
  };
  const media = await handleVisitorStart(new Request("https://demo.test/api/visitor/start", { method: "POST", body: "{}" }), deps);
  assert.equal(media.status, 415);
  const origin = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: "{}",
    }),
    deps,
  );
  assert.equal(origin.status, 403);
  const response = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    deps,
  );
  const body = (await response.json()) as { error?: string };
  assert.equal(response.status, 503);
  assert.equal(body.error, "faucet not configured");
});

test("visitor start funds once, refunds a failed transfer, and caps the day", async () => {
  const store = memoryStore({ isolated: true });
  const transfers: { to: string; yocto: bigint }[] = [];
  const deps = {
    now: NOW,
    secret: SECRET,
    configured: true,
    store,
    balance: async () => FAUCET_FLOOR_YOCTO,
    visitorBalance: async () => 0n,
    transfer: async (to: string, yocto: bigint) => {
      transfers.push({ to, yocto });
      return "TxHash111111111111111111";
    },
    verify: async () => true,
  };
  const first = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody(PUBLIC),
    }),
    deps,
  );
  assert.equal(first.status, 200);
  const funded = (await first.json()) as { accountId?: string; txHash?: string };
  assert.equal(funded.accountId, PUBLIC);
  assert.equal(funded.txHash, "TxHash111111111111111111");
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0]?.yocto, FAUCET_TRANSFER_YOCTO);
  assert.equal(JSON.stringify(funded).includes("configured"), false);
  const session = readVisitorSession(first.headers.get("set-cookie"), SECRET, NOW);
  assert.equal(session?.patient, PUBLIC);
  assert.equal(session?.patientMode, "local");

  const again = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: first.headers.get("set-cookie") ?? "", "content-type": "application/json" },
      body: startBody(PUBLIC),
    }),
    deps,
  );
  const repeated = (await again.json()) as { already?: boolean };
  assert.equal(again.status, 200);
  assert.equal(repeated.already, true);
  assert.equal(transfers.length, 1);
  assert.equal(await faucetDayUsage(store, NOW), 1);

  const fundedAlready = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody("44".repeat(32)),
    }),
    { ...deps, visitorBalance: async () => FAUCET_FLOOR_YOCTO },
  );
  assert.equal(fundedAlready.status, 200);
  assert.equal(((await fundedAlready.json()) as { already?: boolean }).already, true);
  assert.equal(transfers.length, 1);

  const low = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody("ef".repeat(32)),
    }),
    { ...deps, balance: async () => 1n },
  );
  assert.equal(low.status, 503);
  assert.equal(((await low.json()) as { error?: string }).error, "faucet balance is low");
  assert.equal(await faucetDayUsage(store, NOW), 1);

  const uncertainAccount = "11".repeat(32);
  let uncertainTransfers = 0;
  const failing = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody(uncertainAccount),
    }),
    {
      ...deps,
      transfer: async () => {
        uncertainTransfers += 1;
        throw new Error("rpc down");
      },
    },
  );
  assert.equal(failing.status, 503);
  assert.equal(((await failing.json()) as { error?: string }).error, "The faucet transfer is unconfirmed. No new funds were sent.");
  assert.equal(uncertainTransfers, 1);
  assert.equal(await faucetDayUsage(store, NOW), 2);
  const retryUncertain = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody(uncertainAccount),
    }),
    {
      ...deps,
      transfer: async () => {
        uncertainTransfers += 1;
        throw new Error("rpc down");
      },
    },
  );
  assert.equal(retryUncertain.status, 503);
  assert.equal(uncertainTransfers, 1);
  assert.equal(await faucetDayUsage(store, NOW), 2);

  for (let i = 0; i < FAUCET_IP_LIMIT - 2; i += 1) {
    const response = await handleVisitorStart(
      new Request("https://demo.test/api/visitor/start", {
        method: "POST",
        headers: { cookie: cookie(), "content-type": "application/json" },
        body: startBody(`${(i + 2).toString(16).padStart(2, "0")}`.repeat(32)),
      }),
      deps,
    );
    assert.equal(response.status, 200, String(i));
  }
  const blocked = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody("99".repeat(32)),
    }),
    deps,
  );
  assert.equal(blocked.status, 429);
});

test("the faucet day cap is 150 and is separate from other counters", async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  const store = memoryStore({ isolated: true });
  let n = 0;
  const deps = {
    now: NOW,
    secret: SECRET,
    configured: true,
    store,
    balance: async () => FAUCET_FLOOR_YOCTO,
    visitorBalance: async () => 0n,
    transfer: async () => {
      n += 1;
      return "TxHash111111111111111111";
    },
    verify: async () => true,
  };
  try {
    for (let i = 0; i < FAUCET_DAY_LIMIT; i += 1) {
      const response = await handleVisitorStart(
        new Request("https://demo.test/api/visitor/start", {
          method: "POST",
          headers: {
            cookie: cookie(),
            "content-type": "application/json",
            origin: "https://demo.test",
            "x-real-ip": `198.51.100.${i % 200}`,
          },
          body: startBody(i.toString(16).padStart(64, "a")),
        }),
        deps,
      );
      assert.equal(response.status, 200, String(i));
    }
    const blocked = await handleVisitorStart(
      new Request("https://demo.test/api/visitor/start", {
        method: "POST",
        headers: {
          cookie: cookie(),
          "content-type": "application/json",
          origin: "https://demo.test",
          "x-real-ip": "203.0.113.9",
        },
        body: startBody("b".repeat(64)),
      }),
      deps,
    );
    assert.equal(blocked.status, 429);
    const body = (await blocked.json()) as { error?: string; retryAt?: string };
    assert.match(body.error ?? "", /Try again after/);
    assert.match(body.error ?? "", /UTC/);
    assert.equal(typeof body.retryAt, "string");
    assert.equal(n, FAUCET_DAY_LIMIT);
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("challenge reloads do not consume faucet slots", async () => {
  const store = memoryStore({ isolated: true });
  const deps = { now: NOW, secret: SECRET, store };
  let sessionCookie = cookie();
  for (let i = 0; i < 4; i += 1) {
    const challenge = await handleVisitorChallenge(
      new Request("https://demo.test/api/visitor/challenge", { method: "POST", headers: { cookie: sessionCookie } }),
      deps,
    );
    assert.equal(challenge.status, 200, String(i));
    sessionCookie = challenge.headers.get("set-cookie") ?? sessionCookie;
  }
  assert.equal(await faucetDayUsage(store, NOW), 0);
  const bound = await handleVisitorBind(
    new Request("https://demo.test/api/visitor/bind", {
      method: "POST",
      headers: { cookie: sessionCookie, "content-type": "application/json" },
      body: JSON.stringify({
        accountId: "visitor.testnet",
        publicKey: "ed25519:NearTestKey",
        signature: Buffer.alloc(64, 7).toString("base64"),
        encPubkey: ENC,
      }),
    }),
    { ...deps, configured: false, verify: async () => true },
  );
  assert.equal(bound.status, 200);
  assert.equal(await faucetDayUsage(store, NOW), 0);
});

test("challenge reloads leave the faucet IP cap for real funding", async () => {
  const store = memoryStore({ isolated: true });
  for (let i = 0; i < 4; i += 1) {
    const challenge = await handleVisitorChallenge(new Request("https://demo.test/api/visitor/challenge", { method: "POST", headers: { cookie: cookie() } }), {
      now: NOW,
      secret: SECRET,
      store,
    });
    assert.equal(challenge.status, 200);
  }
  assert.equal(await faucetDayUsage(store, NOW), 0);
  const deps = {
    now: NOW,
    secret: SECRET,
    configured: true,
    store,
    balance: async () => FAUCET_FLOOR_YOCTO,
    visitorBalance: async () => 0n,
    transfer: async () => "TxHash111111111111111111",
    verify: async () => true,
  };
  for (let i = 0; i < FAUCET_IP_LIMIT; i += 1) {
    const response = await handleVisitorStart(
      new Request("https://demo.test/api/visitor/start", {
        method: "POST",
        headers: { cookie: cookie(), "content-type": "application/json" },
        body: startBody(`${(i + 1).toString(16).padStart(2, "0")}`.repeat(32)),
      }),
      deps,
    );
    assert.equal(response.status, 200, String(i));
  }
  assert.equal(await faucetDayUsage(store, NOW), FAUCET_IP_LIMIT);
  const blocked = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody("99".repeat(32)),
    }),
    deps,
  );
  assert.equal(blocked.status, 429);
  assert.equal(await faucetDayUsage(store, NOW), FAUCET_IP_LIMIT);
});

test("the challenge limiter is per IP and does not block the faucet", async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  const store = memoryStore({ isolated: true });
  try {
    const challengeFrom = (ip: string, sessionCookie = cookie()) =>
      handleVisitorChallenge(
        new Request("https://demo.test/api/visitor/challenge", {
          method: "POST",
          headers: { cookie: sessionCookie, origin: "https://demo.test", "x-real-ip": ip },
        }),
        { now: NOW, secret: SECRET, store },
      );
    for (let i = 0; i < CHALLENGE_IP_LIMIT; i += 1) {
      const response = await challengeFrom("203.0.113.10");
      assert.equal(response.status, 200, String(i));
    }
    const blocked = await challengeFrom("203.0.113.10");
    assert.equal(blocked.status, 429);
    const body = (await blocked.json()) as { error?: string };
    assert.equal(body.error?.includes("sign-in"), true);
    assert.match(body.error ?? "", /Try again after/);
    assert.equal(body.error?.includes("faucet"), false);
    assert.equal(await faucetDayUsage(store, NOW), 0);
    const other = await challengeFrom("203.0.113.11");
    assert.equal(other.status, 200);
    const funded = await handleVisitorStart(
      new Request("https://demo.test/api/visitor/start", {
        method: "POST",
        headers: {
          cookie: cookie(),
          "content-type": "application/json",
          origin: "https://demo.test",
          "x-real-ip": "203.0.113.10",
        },
        body: startBody(PUBLIC),
      }),
      {
        now: NOW,
        secret: SECRET,
        configured: true,
        store,
        balance: async () => FAUCET_FLOOR_YOCTO,
        visitorBalance: async () => 0n,
        transfer: async () => "TxHash111111111111111111",
        verify: async () => true,
      },
    );
    assert.equal(funded.status, 200);
    assert.equal(await faucetDayUsage(store, NOW), 1);
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("wallet bind checks the session challenge and does not print a key", async () => {
  const store = memoryStore({ isolated: true });
  const challenge = await handleVisitorChallenge(new Request("https://demo.test/api/visitor/challenge", { method: "POST", headers: { cookie: cookie() } }), {
    now: NOW,
    secret: SECRET,
    store,
  });
  const issued = (await challenge.json()) as { message?: string; nonce?: string };
  assert.equal(issued.message, LOGIN_MESSAGE);
  const sessionCookie = challenge.headers.get("set-cookie") ?? "";
  const seen: string[] = [];
  const response = await handleVisitorBind(
    new Request("https://demo.test/api/visitor/bind", {
      method: "POST",
      headers: { cookie: sessionCookie, "content-type": "application/json" },
      body: JSON.stringify({
        accountId: "visitor.testnet",
        publicKey: "ed25519:NearTestKey",
        signature: Buffer.alloc(64, 7).toString("base64"),
        encPubkey: ENC,
      }),
    }),
    {
      now: NOW,
      secret: SECRET,
      store,
      configured: false,
      verify: async (input) => {
        seen.push(input.accountId);
        return input.message === LOGIN_MESSAGE && input.nonce.length === 32;
      },
    },
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { accountId?: string; needsFunds?: boolean; mode?: string };
  assert.equal(body.accountId, "visitor.testnet");
  assert.equal(body.mode, "wallet");
  assert.equal(body.needsFunds, true);
  assert.equal(seen[0], "visitor.testnet");
  assert.equal(JSON.stringify(body).includes("ed25519:"), false);
  const bound = readVisitorSession(response.headers.get("set-cookie"), SECRET, NOW);
  assert.equal(bound?.patientMode, "wallet");
  assert.equal(bound?.challengeNonce, "");
});

test("a funded account is not bound without a valid device signature", async () => {
  const store = memoryStore({ isolated: true });
  let transfers = 0;
  const response = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody("44".repeat(32)),
    }),
    {
      now: NOW,
      secret: SECRET,
      configured: true,
      store,
      balance: async () => FAUCET_FLOOR_YOCTO,
      visitorBalance: async () => FAUCET_FLOOR_YOCTO,
      transfer: async () => {
        transfers += 1;
        return "TxHash111111111111111111";
      },
      verify: async () => false,
    },
  );
  assert.equal(response.status, 403);
  assert.equal(transfers, 0);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("each implicit account is funded only once", async () => {
  const store = memoryStore({ isolated: true });
  let transfers = 0;
  const deps = {
    now: NOW,
    secret: SECRET,
    configured: true,
    store,
    balance: async () => FAUCET_FLOOR_YOCTO,
    visitorBalance: async () => 0n,
    transfer: async () => {
      transfers += 1;
      return "TxHash111111111111111111";
    },
    verify: async () => true,
  };
  const first = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody(PUBLIC),
    }),
    deps,
  );
  assert.equal(first.status, 200);
  const second = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody(PUBLIC),
    }),
    deps,
  );
  assert.equal(second.status, 200);
  assert.equal(((await second.json()) as { already?: boolean }).already, true);
  assert.equal(transfers, 1);
});

test("a foreign origin is rejected before the faucet runs", async () => {
  let transfers = 0;
  const response = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json", origin: "https://evil.example" },
      body: startBody(PUBLIC),
    }),
    {
      now: NOW,
      secret: SECRET,
      configured: true,
      store: memoryStore({ isolated: true }),
      balance: async () => FAUCET_FLOOR_YOCTO,
      visitorBalance: async () => 0n,
      transfer: async () => {
        transfers += 1;
        return "TxHash111111111111111111";
      },
      verify: async () => true,
    },
  );
  assert.equal(response.status, 403);
  assert.equal(transfers, 0);
});

test("visitor start rejects an expired or missing challenge and does not fund", async () => {
  const store = memoryStore({ isolated: true });
  let transfers = 0;
  const deps = {
    now: NOW,
    secret: SECRET,
    configured: true,
    store,
    balance: async () => FAUCET_FLOOR_YOCTO,
    visitorBalance: async () => 0n,
    transfer: async () => {
      transfers += 1;
      return "TxHash111111111111111111";
    },
    verify: async () => true,
  };
  const expired = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(NOW - 1), "content-type": "application/json" },
      body: startBody(PUBLIC),
    }),
    deps,
  );
  assert.equal(expired.status, 403);
  assert.equal(((await expired.json()) as { error?: string }).error, "challenge expired");
  const bare = writeVisitorCookie(newVisitorSession(NOW), SECRET, false).split(";")[0] ?? "";
  const missing = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: bare, "content-type": "application/json" },
      body: startBody("12".repeat(32)),
    }),
    deps,
  );
  assert.equal(missing.status, 403);
  assert.equal(((await missing.json()) as { error?: string }).error, "challenge expired");
  assert.equal(transfers, 0);
  assert.equal(await faucetDayUsage(store, NOW), 0);
});

test("visitor start clears the challenge after a successful sign-in", async () => {
  const store = memoryStore({ isolated: true });
  let transfers = 0;
  const deps = {
    now: NOW,
    secret: SECRET,
    configured: true,
    store,
    balance: async () => FAUCET_FLOOR_YOCTO,
    visitorBalance: async () => 0n,
    transfer: async () => {
      transfers += 1;
      return "TxHash111111111111111111";
    },
    verify: async () => true,
  };
  const first = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody(PUBLIC),
    }),
    deps,
  );
  assert.equal(first.status, 200);
  const session = readVisitorSession(first.headers.get("set-cookie"), SECRET, NOW);
  assert.equal(session?.challengeNonce, "");
  assert.equal(session?.challengeExp, 0);
  const again = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: first.headers.get("set-cookie") ?? "", "content-type": "application/json" },
      body: startBody("22".repeat(32)),
    }),
    deps,
  );
  assert.equal(again.status, 403);
  assert.equal(((await again.json()) as { error?: string }).error, "challenge expired");
  assert.equal(transfers, 1);
});

test("the faucet store is one shared object", () => {
  assert.equal(faucetStore(), faucetStore());
});

test("an unknown balance and a lost transfer do not send a second payment", async () => {
  const store = memoryStore({ isolated: true });
  let transfers = 0;
  const deps = {
    now: NOW,
    secret: SECRET,
    configured: true,
    store,
    balance: async () => FAUCET_FLOOR_YOCTO,
    verify: async () => true,
    transfer: async () => {
      transfers += 1;
      return "TxHash111111111111111111";
    },
  };
  const unknown = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody("55".repeat(32)),
    }),
    { ...deps, visitorBalance: async () => Promise.reject(new Error("rpc down")) },
  );
  assert.equal(unknown.status, 503);
  assert.match(((await unknown.json()) as { error?: string }).error ?? "", /unknown/);
  assert.equal(transfers, 0);

  const account = "66".repeat(32);
  const lost = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody(account),
    }),
    {
      ...deps,
      visitorBalance: async () => 0n,
      transfer: async () => {
        transfers += 1;
        throw new Error("lost response");
      },
    },
  );
  assert.equal(lost.status, 503);
  assert.equal(transfers, 1);
  const settled = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody(account),
    }),
    { ...deps, visitorBalance: async () => FAUCET_FLOOR_YOCTO },
  );
  assert.equal(settled.status, 200);
  assert.equal(((await settled.json()) as { already?: boolean }).already, true);
  assert.equal(transfers, 1);

  const failedAccount = "77".repeat(32);
  await beginFunding(store, failedAccount, "intent");
  await attachFundingTx(store, failedAccount, "FailedHash11111111111111");
  const retried = await handleVisitorStart(
    new Request("https://demo.test/api/visitor/start", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: startBody(failedAccount),
    }),
    {
      ...deps,
      visitorBalance: async () => 0n,
      txStatus: async () => "failure",
    },
  );
  assert.equal(retried.status, 200);
  assert.equal(transfers, 2);
});

test("status labels the demo server key honestly", () => {
  const demo = statusFor("", "", "", false, "rr-patient-6c9910d7.testnet");
  assert.equal(demo.kind, "demo-server");
  assert.equal(demo.label, DEMO_SIGNER_LABEL);
  const local = statusFor(PUBLIC, "local", ENC, true, "rr-patient-6c9910d7.testnet");
  assert.equal(local.kind, "local-key");
  assert.equal(local.label, LOCAL_SIGNER_LABEL);
  assert.equal(local.accountId, PUBLIC);
});
