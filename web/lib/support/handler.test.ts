import assert from "node:assert/strict";
import { test } from "node:test";
import { handleSupport, supportClientIp, SUPPORT_OPEN_CAP, SUPPORT_WALLET_LIMIT } from "./handler.ts";
import { ADMIN_PAGE_SIZE, memoryLimits, memoryTicketStore, redisTicketStore, resetDevSupport, supportKeyPrefix, SUPPORT_RETENTION_MS } from "./store.ts";
import type { Redis } from "@upstash/redis";

const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const OWNER = "rr6c9910d7.testnet";
const ALICE = "alice.testnet";
const BOB = "bob.testnet";

function post(url: string, body: unknown, origin = "https://demo.test"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

function signed(action: string, nonce: string, accountId: string, extra: Record<string, string> = {}) {
  return {
    action,
    accountId,
    publicKey: "ed25519:8" + "2".repeat(40),
    signature: Buffer.alloc(64, 7).toString("base64"),
    nonce,
    ...extra,
  };
}

async function harness(verify: (accountId: string) => boolean = () => true) {
  const tickets = memoryTicketStore();
  const deps = {
    now: NOW,
    tickets,
    limits: memoryLimits(12, SUPPORT_WALLET_LIMIT),
    ownerId: OWNER,
    verify: async (input: { accountId: string }) => verify(input.accountId),
  };
  return { tickets, deps };
}

test("a bad signature stores nothing", async () => {
  const { tickets, deps } = await harness(() => false);
  const challenge = await handleSupport(post("https://demo.test/api/support/challenge", {}), deps);
  const nonce = ((await challenge.json()) as { nonce: string }).nonce;
  const response = await handleSupport(
    post("https://demo.test/api/support", signed("create", nonce, ALICE, { subject: "Hello", message: "The chart did not open." })),
    deps,
  );
  assert.equal(response.status, 403);
  const saved = JSON.stringify(tickets.all());
  assert.equal(saved.includes("The chart did not open."), false);
  assert.equal(saved.includes("email"), false);
});

test("a replay of the same sign-in is rejected", async () => {
  const { deps } = await harness();
  const challenge = await handleSupport(post("https://demo.test/api/support/challenge", {}), deps);
  const nonce = ((await challenge.json()) as { nonce: string }).nonce;
  const body = signed("create", nonce, ALICE, { subject: "Hello", message: "Please look at the open step." });
  const first = await handleSupport(post("https://demo.test/api/support", body), deps);
  const second = await handleSupport(post("https://demo.test/api/support", body), deps);
  assert.equal(first.status, 201);
  assert.equal(second.status, 403);
});

test("the wallet rate limit stops another note", async () => {
  const { tickets, deps } = await harness();
  let last = 0;
  for (let index = 0; index < SUPPORT_WALLET_LIMIT + 1; index += 1) {
    const nonce = await tickets.issueNonce(NOW + index);
    const response = await handleSupport(
      post("https://demo.test/api/support", signed("create", nonce, ALICE, { subject: `Note ${index}`, message: "Still the fictional chart." })),
      { ...deps, now: NOW + index },
    );
    last = response.status;
  }
  assert.equal(last, 429);
});

test("a rejected signature does not spend the wallet limit", async () => {
  const { tickets, deps } = await harness(() => false);
  for (let index = 0; index < SUPPORT_WALLET_LIMIT + 2; index += 1) {
    const nonce = await tickets.issueNonce(NOW + index);
    const response = await handleSupport(
      post("https://demo.test/api/support", signed("create", nonce, ALICE, { subject: `Try ${index}`, message: "Still the fictional chart." })),
      { ...deps, now: NOW + index },
    );
    assert.equal(response.status, 403);
  }
  const nonce = await tickets.issueNonce(NOW + 20);
  const accepted = await handleSupport(
    post("https://demo.test/api/support", signed("create", nonce, ALICE, { subject: "Kept", message: "Still the fictional chart." })),
    { ...deps, now: NOW + 20, verify: async () => true },
  );
  assert.equal(accepted.status, 201);
});

test("a message over 2000 characters is refused", async () => {
  const { tickets, deps } = await harness();
  const response = await handleSupport(
    post("https://demo.test/api/support", signed("create", "ab".repeat(32), ALICE, { subject: "Too long", message: "x".repeat(2001) })),
    deps,
  );
  assert.equal(response.status, 400);
  assert.equal(JSON.stringify(tickets.all()).includes("x".repeat(40)), false);
});

test("a personal identifier is not stored", async () => {
  const { tickets, deps } = await harness();
  const response = await handleSupport(
    post("https://demo.test/api/support", signed("create", "cd".repeat(32), ALICE, { subject: "Record", message: "Call Jane Doe at 555-0199." })),
    deps,
  );
  assert.equal(response.status, 422);
  assert.equal(JSON.stringify(tickets.all()).includes("Jane Doe"), false);
});

test("wallet A cannot read wallet B's tickets", async () => {
  const { deps } = await harness();
  const opened = await handleSupport(post("https://demo.test/api/support/challenge", {}), deps);
  const nonce = ((await opened.json()) as { nonce: string }).nonce;
  const created = await handleSupport(
    post("https://demo.test/api/support", signed("create", nonce, BOB, { subject: "Bob only", message: "This note belongs to Bob." })),
    deps,
  );
  assert.equal(created.status, 201);
  const id = ((await created.json()) as { id: string }).id;
  const listed = await handleSupport(post("https://demo.test/api/support/challenge", {}), deps);
  const listNonce = ((await listed.json()) as { nonce: string }).nonce;
  const mine = await handleSupport(post("https://demo.test/api/support", signed("list", listNonce, ALICE)), deps);
  assert.equal(mine.status, 200);
  const body = (await mine.json()) as { tickets: { id: string }[] };
  assert.equal(body.tickets.some((ticket) => ticket.id === id), false);
});

test("only the owner wallet can list, reply, and close", async () => {
  const { deps } = await harness();
  const opened = await handleSupport(post("https://demo.test/api/support/challenge", {}), deps);
  const nonce = ((await opened.json()) as { nonce: string }).nonce;
  const created = await handleSupport(
    post("https://demo.test/api/support", signed("create", nonce, ALICE, { subject: "Need a look", message: "The open step stayed on waiting." })),
    deps,
  );
  const id = ((await created.json()) as { id: string }).id;
  const stranger = await handleSupport(post("https://demo.test/api/support/challenge", {}), deps);
  const strangerNonce = ((await stranger.json()) as { nonce: string }).nonce;
  const denied = await handleSupport(post("https://demo.test/api/support/admin", signed("admin", strangerNonce, ALICE)), deps);
  assert.equal(denied.status, 403);
  const ownerChallenge = await handleSupport(post("https://demo.test/api/support/challenge", {}), deps);
  const ownerNonce = ((await ownerChallenge.json()) as { nonce: string }).nonce;
  const allowed = await handleSupport(post("https://demo.test/api/support/admin", signed("admin", ownerNonce, OWNER)), deps);
  assert.equal(allowed.status, 200);
  const replyChallenge = await handleSupport(post("https://demo.test/api/support/challenge", {}), deps);
  const replyNonce = ((await replyChallenge.json()) as { nonce: string }).nonce;
  const replied = await handleSupport(
    post("https://demo.test/api/support/admin", signed("reply", replyNonce, OWNER, { ticketId: id, reply: "The open is written before the chart appears." })),
    deps,
  );
  assert.equal(replied.status, 200);
  const closeChallenge = await handleSupport(post("https://demo.test/api/support/challenge", {}), deps);
  const closeNonce = ((await closeChallenge.json()) as { nonce: string }).nonce;
  const closed = await handleSupport(post("https://demo.test/api/support/admin", signed("close", closeNonce, OWNER, { ticketId: id })), deps);
  assert.equal(closed.status, 200);
});

async function adminCall(deps: Awaited<ReturnType<typeof harness>>["deps"], accountId: string, action: "admin" | "reply" | "close", extra: Record<string, string> = {}) {
  const challenge = await handleSupport(post("https://demo.test/api/support/challenge", {}), deps);
  const nonce = ((await challenge.json()) as { nonce: string }).nonce;
  return handleSupport(post("https://demo.test/api/support/admin", signed(action, nonce, accountId, extra)), deps);
}

test("an unset SUPPORT_ADMIN_ACCOUNT_ID refuses every wallet", async () => {
  const previousAdmin = process.env.SUPPORT_ADMIN_ACCOUNT_ID;
  const previousContract = process.env.RELAY_CONTRACT_ID;
  delete process.env.SUPPORT_ADMIN_ACCOUNT_ID;
  process.env.RELAY_CONTRACT_ID = OWNER;
  try {
    const { deps } = await harness();
    const open = { ...deps, ownerId: undefined };
    const challenge = await handleSupport(post("https://demo.test/api/support/challenge", {}), open);
    const nonce = ((await challenge.json()) as { nonce: string }).nonce;
    const created = await handleSupport(
      post("https://demo.test/api/support", signed("create", nonce, ALICE, { subject: "Hello", message: "A note from Alice." })),
      open,
    );
    assert.equal(created.status, 201);
    const contractWallet = await adminCall(open, OWNER, "admin");
    const alice = await adminCall(open, ALICE, "admin");
    assert.equal(contractWallet.status, 403);
    assert.equal(alice.status, 403);
  } finally {
    if (previousAdmin === undefined) delete process.env.SUPPORT_ADMIN_ACCOUNT_ID;
    else process.env.SUPPORT_ADMIN_ACCOUNT_ID = previousAdmin;
    if (previousContract === undefined) delete process.env.RELAY_CONTRACT_ID;
    else process.env.RELAY_CONTRACT_ID = previousContract;
  }
});

test("only SUPPORT_ADMIN_ACCOUNT_ID can open the desk", async () => {
  const previousAdmin = process.env.SUPPORT_ADMIN_ACCOUNT_ID;
  const previousContract = process.env.RELAY_CONTRACT_ID;
  process.env.SUPPORT_ADMIN_ACCOUNT_ID = "support-admin.testnet";
  process.env.RELAY_CONTRACT_ID = OWNER;
  try {
    const { deps } = await harness();
    const open = { ...deps, ownerId: undefined };
    const contractWallet = await adminCall(open, OWNER, "admin");
    const admin = await adminCall(open, "support-admin.testnet", "admin");
    assert.equal(contractWallet.status, 403);
    assert.equal(admin.status, 200);
  } finally {
    if (previousAdmin === undefined) delete process.env.SUPPORT_ADMIN_ACCOUNT_ID;
    else process.env.SUPPORT_ADMIN_ACCOUNT_ID = previousAdmin;
    if (previousContract === undefined) delete process.env.RELAY_CONTRACT_ID;
    else process.env.RELAY_CONTRACT_ID = previousContract;
  }
});

test("support redis keys are prefixed with the deployment environment", () => {
  const previous = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    assert.equal(supportKeyPrefix(), "preview:");
    delete process.env.VERCEL_ENV;
    assert.equal(supportKeyPrefix(), "dev:");
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test("the support address is the first forwarded hop", () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const request = new Request("https://demo.test/api/support/challenge", {
      headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.4", "x-real-ip": "198.51.100.2" },
    });
    assert.equal(supportClientIp(request), "203.0.113.8");
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("an IP limiter error refuses the request", async () => {
  const { deps } = await harness();
  const response = await handleSupport(post("https://demo.test/api/support/challenge", {}), {
    ...deps,
    limits: { ip: async () => "error", wallet: async () => "allow" },
  });
  assert.equal(response.status, 503);
});

test("support refuses every caller when Redis is not configured in production", async () => {
  const previousNode = process.env.NODE_ENV;
  const previousUrl = process.env.KV_REST_API_URL;
  const previousToken = process.env.KV_REST_API_TOKEN;
  process.env.NODE_ENV = "production";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  try {
    const response = await handleSupport(post("https://demo.test/api/support/challenge", {}), { now: NOW, ownerId: OWNER, verify: async () => true });
    assert.equal(response.status, 503);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /not configured/);
  } finally {
    if (previousNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNode;
    if (previousUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previousUrl;
    if (previousToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previousToken;
  }
});

test("a wallet cannot keep more than the open-note cap", async () => {
  const { tickets, deps } = await harness();
  for (let index = 0; index < SUPPORT_OPEN_CAP; index += 1) {
    await tickets.addTicket({ walletId: ALICE, subject: `Open ${index}`, message: "Fictional chart note.", now: NOW + index });
  }
  const blockedNonce = await tickets.issueNonce(NOW + 50);
  const blocked = await handleSupport(
    post("https://demo.test/api/support", signed("create", blockedNonce, ALICE, { subject: "One more", message: "Still fictional." })),
    { ...deps, now: NOW + 50 },
  );
  assert.equal(blocked.status, 429);
  const held = await tickets.listWallet(ALICE, NOW + 50);
  const newest = held[0];
  assert.ok(newest);
  await tickets.closeTicket(newest.id, NOW + 51);
  const nonce = await tickets.issueNonce(NOW + 52);
  const opened = await handleSupport(
    post("https://demo.test/api/support", signed("create", nonce, ALICE, { subject: "After close", message: "Still fictional." })),
    { ...deps, now: NOW + 52 },
  );
  assert.equal(opened.status, 201);
});

test("the admin list pages one hundred tickets and a cursor", async () => {
  const { tickets, deps } = await harness();
  for (let index = 0; index < ADMIN_PAGE_SIZE + 1; index += 1) {
    await tickets.addTicket({ walletId: ALICE, subject: `Note ${index}`, message: "Fictional chart note.", now: NOW + index });
  }
  const firstNonce = await tickets.issueNonce(NOW + 200);
  const first = await handleSupport(post("https://demo.test/api/support/admin", signed("admin", firstNonce, OWNER)), deps);
  const page = (await first.json()) as { tickets: { subject: string }[]; cursor: string | null };
  assert.equal(first.status, 200);
  assert.equal(page.tickets.length, ADMIN_PAGE_SIZE);
  assert.equal(page.cursor, "100");
  assert.equal(page.tickets[0]?.subject, `Note ${ADMIN_PAGE_SIZE}`);
  const secondNonce = await tickets.issueNonce(NOW + 201);
  const second = await handleSupport(
    post("https://demo.test/api/support/admin", signed("admin", secondNonce, OWNER, { cursor: "100" })),
    deps,
  );
  const rest = (await second.json()) as { tickets: { subject: string }[]; cursor: string | null };
  assert.equal(rest.tickets.length, 1);
  assert.equal(rest.tickets[0]?.subject, "Note 0");
  assert.equal(rest.cursor, null);
});

test("redis admin paging reads zrange 0 through 99 on an env-prefixed key", async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  try {
    const calls: { key: string; start: number; stop: number; rev?: boolean }[] = [];
    const ids = Array.from({ length: ADMIN_PAGE_SIZE }, (_, index) => index.toString(16).padStart(32, "0"));
    const redis = {
      async zrange(key: string, start: number, stop: number, opts?: { rev?: boolean }) {
        calls.push({ key, start, stop, rev: opts?.rev });
        return ids.slice(start, stop + 1);
      },
      async mget(...keys: string[]) {
        return keys.map(() => null);
      },
      async zrem() {
        return 1;
      },
    };
    const store = redisTicketStore(redis as unknown as Redis);
    const page = await store.listAdmin(NOW, "0");
    assert.deepEqual(calls[0], { key: "preview:admin:tickets", start: 0, stop: 99, rev: true });
    assert.equal(page.tickets.length, 0);
    assert.equal(page.cursor, "100");
    const next = await store.listAdmin(NOW, page.cursor ?? "");
    assert.equal(calls[1]?.start, 100);
    assert.equal(calls[1]?.stop, 199);
    assert.equal(next.cursor, null);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test("a closed ticket is deleted 30 days later", async () => {
  const { deps } = await harness();
  const opened = await handleSupport(post("https://demo.test/api/support/challenge", {}), deps);
  const nonce = ((await opened.json()) as { nonce: string }).nonce;
  const created = await handleSupport(
    post("https://demo.test/api/support", signed("create", nonce, ALICE, { subject: "Old", message: "This one should age out." })),
    deps,
  );
  const id = ((await created.json()) as { id: string }).id;
  const closeChallenge = await handleSupport(post("https://demo.test/api/support/challenge", {}), deps);
  const closeNonce = ((await closeChallenge.json()) as { nonce: string }).nonce;
  await handleSupport(post("https://demo.test/api/support/admin", signed("close", closeNonce, OWNER, { ticketId: id })), deps);
  const later = NOW + SUPPORT_RETENTION_MS;
  const listChallenge = await handleSupport(post("https://demo.test/api/support/challenge", {}), { ...deps, now: later });
  const listNonce = ((await listChallenge.json()) as { nonce: string }).nonce;
  const listed = await handleSupport(post("https://demo.test/api/support/admin", signed("admin", listNonce, OWNER)), { ...deps, now: later });
  const body = (await listed.json()) as { tickets: { id: string }[] };
  assert.equal(body.tickets.some((ticket) => ticket.id === id), false);
});

test("a development support store survives from challenge to create", async () => {
  const previousNode = process.env.NODE_ENV;
  const previousUrl = process.env.KV_REST_API_URL;
  const previousToken = process.env.KV_REST_API_TOKEN;
  process.env.NODE_ENV = "development";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  resetDevSupport();
  try {
    const challenge = await handleSupport(post("https://demo.test/api/support/challenge", {}), { now: NOW, ownerId: OWNER, verify: async () => true });
    assert.equal(challenge.status, 200);
    const nonce = ((await challenge.json()) as { nonce: string }).nonce;
    const created = await handleSupport(
      post("https://demo.test/api/support", signed("create", nonce, ALICE, { subject: "Desk", message: "Fictional chart note." })),
      { now: NOW, ownerId: OWNER, verify: async () => true },
    );
    assert.equal(created.status, 201);
  } finally {
    resetDevSupport();
    if (previousNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNode;
    if (previousUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previousUrl;
    if (previousToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previousToken;
  }
});
