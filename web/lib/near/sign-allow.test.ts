import assert from "node:assert/strict";
import { test } from "node:test";
import { dayUsage, IP_LIMIT, memoryStore, type HitStore } from "../guard/visitor.ts";

delete process.env.RR_IP_CALL_LIMIT;
delete process.env.RR_SIGN_DAY_LIMIT;
delete process.env.RR_AI_DAY_LIMIT;
import { issueSummaryReceipt, newVisitorSession, rememberIssuedReceipt, writeVisitorCookie, type VisitorSession } from "../session/visitor.ts";
import { handleSign, type SignCallInput, type SignHandlerDeps } from "./sign-handler.ts";
import type { SignAccounts, SignRole } from "./sign-allow.ts";

const SECRET = "test-session-secret";
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const HEX = "ab".repeat(32);
const HEX_B = "cd".repeat(32);
const HEX_C = "ef".repeat(32);
const EXPIRY = "1763000000000000000";

const ACCOUNTS: SignAccounts = {
  clinic: "rr-clinic-a-6c9910d7.testnet",
  patient: "rr-patient-6c9910d7.testnet",
  hospital: "rr-hospital-b-6c9910d7.testnet",
  second: "rr-second-6c9910d7.testnet",
  app: "rr-pulsefit-6c9910d7.testnet",
};

const SIGNERS: Record<SignRole, { accountId: string; secret: string }> = {
  clinic: { accountId: ACCOUNTS.clinic, secret: "clinic-signer" },
  hospital: { accountId: ACCOUNTS.hospital, secret: "hospital-signer" },
  second: { accountId: ACCOUNTS.second, secret: "second-signer" },
  app: { accountId: ACCOUNTS.app, secret: "app-signer" },
  patient: { accountId: ACCOUNTS.patient, secret: "patient-signer" },
};

function cookieFor(setup?: (session: VisitorSession) => void): string {
  const session = newVisitorSession(NOW);
  session.records.push("3");
  session.shares.push("4");
  setup?.(session);
  return writeVisitorCookie(session, SECRET, false).split(";")[0] ?? "";
}

function signRequest(body: unknown, cookie?: string, raw?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return new Request("https://demo.test/api/sign", {
    method: "POST",
    headers,
    body: raw ?? JSON.stringify(body),
  });
}

function harness(): { deps: SignHandlerDeps; calls: SignCallInput[]; store: HitStore } {
  const store = memoryStore({ isolated: true });
  const calls: SignCallInput[] = [];
  const deps: SignHandlerDeps = {
    now: NOW,
    store,
    secret: SECRET,
    accounts: ACCOUNTS,
    signers: SIGNERS,
    contractId: "rr6c9910d7.testnet",
    call: async (input) => {
      calls.push(input);
      return { hash: "tx-hash", value: "9" };
    },
  };
  return { deps, calls, store };
}

function createRecord(patient = ACCOUNTS.patient): Record<string, unknown> {
  return {
    role: "clinic",
    method: "create_record",
    args: { patient, sections: [{ key: "history", cipher_hash: HEX }] },
  };
}

test("allowed calls are signed with the server account for that role", async () => {
  const { deps, calls, store } = harness();
  const cookie = cookieFor((session) => {
    issueSummaryReceipt(session, "4", HEX, NOW);
    rememberIssuedReceipt(session, HEX_B, HEX_C);
  });
  const rejected = [
    { ...createRecord(), role: "patient" },
    { role: "patient", method: "request_open", args: { share_id: "4", nonce_hash: HEX } },
    { role: "clinic", method: "request_open", args: { share_id: "4", nonce_hash: HEX } },
    { role: "clinic", method: "submit_reply", args: { share_id: "4", reply_hash: HEX } },
    { role: "app", method: "submit_reply", args: { share_id: "4", reply_hash: HEX } },
    { role: "clinic", method: "revoke_share", args: { share_id: "4" } },
    createRecord("other.demo.testnet"),
    { role: "clinic", method: "create_record", args: { patient: ACCOUNTS.patient, sections: [{ key: "history", cipher_hash: HEX }] }, accountId: ACCOUNTS.patient },
  ];
  for (const body of rejected) {
    const response = await handleSign(signRequest(body, cookie), deps);
    const payload = (await response.json()) as { error?: string };
    assert.equal(response.status, 400);
    assert.equal(payload.error, "bad request");
  }
  assert.equal(calls.length, 0);
  assert.equal(await dayUsage("sign", NOW, store), 0);

  const allowed = [
    createRecord(),
    {
      role: "clinic",
      method: "request_referral",
      args: { record_id: "3", to: ACCOUNTS.hospital, requested_sections: ["history", "labs"], purpose_hash: HEX },
    },
    {
      role: "patient",
      method: "approve_share",
      args: {
        share_id: "4",
        granted_sections: ["history", "notes"],
        expires_at_ns: EXPIRY,
        read_only: false,
        artifact_hash: HEX,
        tee_receipt_hash: HEX,
      },
    },
    {
      role: "patient",
      method: "create_share",
      args: {
        record_id: "3",
        to: ACCOUNTS.second,
        kind: "SecondOpinion",
        sections: ["imaging", "notes"],
        expires_at_ns: EXPIRY,
        read_only: true,
        purpose_hash: HEX,
        artifact_hash: HEX,
        tee_receipt_hash: null,
        parent: "4",
      },
    },
    {
      role: "patient",
      method: "create_share",
      args: {
        record_id: "3",
        to: ACCOUNTS.app,
        kind: "DeidApp",
        sections: [],
        expires_at_ns: EXPIRY,
        read_only: true,
        purpose_hash: HEX_C,
        artifact_hash: HEX_C,
        tee_receipt_hash: HEX_B,
        parent: null,
      },
    },
    { role: "hospital", method: "request_open", args: { share_id: "4", nonce_hash: HEX } },
    { role: "second", method: "request_open", args: { share_id: "4", nonce_hash: HEX } },
    { role: "app", method: "request_open", args: { share_id: "4", nonce_hash: HEX } },
    { role: "hospital", method: "submit_reply", args: { share_id: "4", reply_hash: HEX } },
    { role: "second", method: "submit_reply", args: { share_id: "4", reply_hash: HEX } },
    { role: "patient", method: "revoke_share", args: { share_id: "4" } },
  ];
  for (const body of allowed) {
    const response = await handleSign(signRequest(body, cookie), deps);
    assert.equal(response.status, 200, JSON.stringify(body));
  }
  assert.equal(calls.length, allowed.length);
  assert.equal(await dayUsage("sign", NOW, store), allowed.length);
  assert.equal(calls[0]?.accountId, ACCOUNTS.clinic);
  assert.equal(calls[0]?.secret, "clinic-signer");
  assert.equal(calls[0]?.methodName, "create_record");
  assert.equal(calls[0]?.deposit, BigInt(0));
  assert.equal(calls[0]?.args.patient, ACCOUNTS.patient);
  assert.deepEqual(calls[0]?.args.sections, [{ key: "history", cipher_hash: HEX }]);
  assert.match(String(calls[0]?.args.request_id), /^[0-9a-f]{64}$/);
  const revoke = calls[calls.length - 1];
  assert.equal(revoke?.accountId, ACCOUNTS.patient);
  assert.equal(revoke?.secret, "patient-signer");
  assert.equal(revoke?.methodName, "revoke_share");
  assert.equal(revoke?.deposit, BigInt(1));
  assert.deepEqual(revoke?.args, { share_id: "4" });
  assert.equal(calls[5]?.accountId, ACCOUNTS.hospital);
  assert.equal(calls[6]?.accountId, ACCOUNTS.second);
  assert.equal(calls[7]?.accountId, ACCOUNTS.app);
  assert.equal(calls[3]?.deposit, BigInt(1));
  assert.equal(calls[2]?.deposit, BigInt(1));
});

test("an unknown method is rejected", async () => {
  const { deps, calls, store } = harness();
  const cookie = cookieFor();
  for (const method of ["register_actor", "request_owner_open"]) {
    const response = await handleSign(signRequest({ role: "patient", method, args: { share_id: "4" } }, cookie), deps);
    const body = (await response.json()) as { error?: string };
    assert.equal(response.status, 400);
    assert.equal(body.error, "bad request");
    assert.equal(JSON.stringify(body).includes(method), false);
  }
  assert.equal(calls.length, 0);
  assert.equal(await dayUsage("sign", NOW, store), 0);
});

test("demo fallback signs decline and revoke-all with 1 yocto", async () => {
  const { deps, calls } = harness();
  const cookie = cookieFor();
  const decline = await handleSign(signRequest({ role: "patient", method: "decline_share", args: { share_id: "4" } }, cookie), deps);
  assert.equal(decline.status, 200);
  const revokeAll = await handleSign(
    signRequest({ role: "patient", method: "revoke_all_for_record", args: { record_id: "3" } }, cookie),
    deps,
  );
  assert.equal(revokeAll.status, 200);
  assert.equal(calls[0]?.methodName, "decline_share");
  assert.equal(calls[0]?.deposit, BigInt(1));
  assert.equal(calls[1]?.methodName, "revoke_all_for_record");
  assert.equal(calls[1]?.deposit, BigInt(1));
  assert.equal(calls[1]?.accountId, ACCOUNTS.patient);
});

test("a bound visitor removes patient methods and binds create_record", async () => {
  const previousAccount = process.env.RELAY_FAUCET_ACCOUNT_ID;
  const previousKey = process.env.RELAY_FAUCET_PRIVATE_KEY;
  process.env.RELAY_FAUCET_ACCOUNT_ID = "faucet.test.near";
  process.env.RELAY_FAUCET_PRIVATE_KEY = "configured";
  try {
    const { deps, calls, store } = harness();
    const visitor = "ab".repeat(32);
    const cookie = cookieFor((session) => {
      session.patient = visitor;
      session.patientMode = "local";
    });
    const patientCall = await handleSign(signRequest({ role: "patient", method: "revoke_share", args: { share_id: "4" } }, cookie), deps);
    const patientBody = (await patientCall.json()) as { error?: string };
    assert.equal(patientCall.status, 403);
    assert.equal(patientBody.error, "browser signs this");
    const wrong = await handleSign(signRequest(createRecord(), cookie), deps);
    assert.equal(wrong.status, 400);
    const created = await handleSign(signRequest(createRecord(visitor), cookie), deps);
    assert.equal(created.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.args.patient, visitor);
    assert.equal(calls[0]?.accountId, ACCOUNTS.clinic);
    assert.equal(await dayUsage("sign", NOW, store), 1);
    const unbound = await handleSign(signRequest(createRecord(), cookieFor()), deps);
    const unboundBody = (await unbound.json()) as { error?: string };
    assert.equal(unbound.status, 403);
    assert.equal(unboundBody.error, "patient not bound");
  } finally {
    if (previousAccount === undefined) delete process.env.RELAY_FAUCET_ACCOUNT_ID;
    else process.env.RELAY_FAUCET_ACCOUNT_ID = previousAccount;
    if (previousKey === undefined) delete process.env.RELAY_FAUCET_PRIVATE_KEY;
    else process.env.RELAY_FAUCET_PRIVATE_KEY = previousKey;
  }
});

test("an extra key is rejected", async () => {
  const { deps, calls, store } = harness();
  const cookie = cookieFor();
  const response = await handleSign(
    signRequest({ role: "patient", method: "revoke_share", args: { share_id: "4", note: "fictional-extra" } }, cookie),
    deps,
  );
  const body = (await response.json()) as { error?: string };
  assert.equal(response.status, 400);
  assert.equal(body.error, "bad request");
  assert.equal(JSON.stringify(body).includes("fictional-extra"), false);
  assert.equal(calls.length, 0);
  assert.equal(await dayUsage("sign", NOW, store), 0);
});

test("an oversized field is rejected", async () => {
  const { deps, calls, store } = harness();
  const cookie = cookieFor();
  const longId = await handleSign(
    signRequest({ role: "patient", method: "revoke_share", args: { share_id: "9".repeat(21) } }, cookie),
    deps,
  );
  const longHash = await handleSign(
    signRequest(
      {
        role: "clinic",
        method: "create_record",
        args: { patient: ACCOUNTS.patient, sections: [{ key: "history", cipher_hash: "ab".repeat(33) }] },
      },
      cookie,
    ),
    deps,
  );
  assert.equal(longId.status, 400);
  assert.equal(longHash.status, 400);
  assert.equal(((await longId.json()) as { error?: string }).error, "bad request");
  assert.equal(calls.length, 0);
  assert.equal(await dayUsage("sign", NOW, store), 0);
});

test("padded and overflow share ids never reach the signer", async () => {
  const { deps, calls, store } = harness();
  const cookie = cookieFor();
  for (const share_id of ["01", "001", " 1", "+1", "1e0", "0x1", "18446744073709551616"]) {
    const response = await handleSign(signRequest({ role: "patient", method: "revoke_share", args: { share_id } }, cookie), deps);
    assert.equal(response.status, 400, share_id);
    assert.equal(((await response.json()) as { error?: string }).error, "bad request");
  }
  const record = await handleSign(
    signRequest({ role: "patient", method: "revoke_all_for_record", args: { record_id: "01" } }, cookie),
    deps,
  );
  assert.equal(record.status, 400);
  const zero = await handleSign(signRequest({ role: "patient", method: "revoke_share", args: { share_id: "0" } }, cookie), deps);
  const max = await handleSign(
    signRequest({ role: "patient", method: "revoke_share", args: { share_id: "18446744073709551615" } }, cookie),
    deps,
  );
  assert.equal(zero.status, 403);
  assert.equal(max.status, 403);
  assert.equal(calls.length, 0);
  assert.equal(await dayUsage("sign", NOW, store), 0);
});

test("a wrong type is rejected", async () => {
  const { deps, calls, store } = harness();
  const cookie = cookieFor();
  const response = await handleSign(signRequest({ role: "patient", method: "revoke_share", args: { share_id: 4 } }, cookie), deps);
  const body = (await response.json()) as { error?: string };
  assert.equal(response.status, 400);
  assert.equal(body.error, "bad request");
  assert.equal(calls.length, 0);
  assert.equal(await dayUsage("sign", NOW, store), 0);
});

test("unauthenticated and invalid sign requests do not consume the daily budget", async () => {
  const { deps, calls, store } = harness();
  const cookie = cookieFor();
  for (let i = 0; i < IP_LIMIT; i += 1) {
    const response = await handleSign(signRequest({ role: "nope", method: "nope", args: {} }), deps);
    assert.equal(response.status, 400);
  }
  const anonymous = await handleSign(signRequest(createRecord()), deps);
  assert.equal(anonymous.status, 401);
  const malformed = await handleSign(signRequest(null, cookie, "{"), deps);
  assert.equal(malformed.status, 400);
  const foreign = await handleSign(signRequest({ role: "patient", method: "revoke_share", args: { share_id: "8" } }, cookie), deps);
  assert.equal(foreign.status, 403);
  const allowed = await handleSign(signRequest(createRecord(), cookie), deps);
  assert.equal(allowed.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(await dayUsage("sign", NOW, store), 1);
});

test("a valid sign consumes one daily budget unit", async () => {
  const { deps, calls, store } = harness();
  const cookie = cookieFor();
  const response = await handleSign(signRequest(createRecord(), cookie), deps);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(await dayUsage("sign", NOW, store), 1);
  const invalid = await handleSign(signRequest({ role: "patient", method: "register_actor", args: {} }, cookie), deps);
  assert.equal(invalid.status, 400);
  assert.equal(await dayUsage("sign", NOW, store), 1);
});

test("a lost creation response retries the same request id and keeps one result", async () => {
  const { deps, calls } = harness();
  let attempts = 0;
  deps.call = async (input) => {
    calls.push(input);
    attempts += 1;
    if (attempts === 1) throw new Error("sign failed");
    return { hash: "tx-reconciled", value: "9" };
  };
  const cookie = cookieFor();
  const response = await handleSign(signRequest(createRecord(), cookie), deps);
  const body = (await response.json()) as { hash?: string; value?: unknown };
  assert.equal(response.status, 200);
  assert.equal(body.hash, "tx-reconciled");
  assert.equal(body.value, "9");
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.args.request_id, calls[1]?.args.request_id);
  assert.match(String(calls[0]?.args.request_id), /^[0-9a-f]{64}$/);
});

test("a definite contract error is not retried", async () => {
  const { deps, calls } = harness();
  deps.call = async (input) => {
    calls.push(input);
    throw new Error("ERR_BAD_ROLE");
  };
  const cookie = cookieFor();
  const response = await handleSign(signRequest(createRecord(), cookie), deps);
  const body = (await response.json()) as { error?: string };
  assert.equal(response.status, 400);
  assert.equal(body.error, "ERR_BAD_ROLE");
  assert.equal(calls.length, 1);
});

test("sign rejects a foreign origin and a non-JSON body before it signs", async () => {
  const { deps, calls } = harness();
  const cookie = cookieFor();
  const foreign = new Request("https://demo.test/api/sign", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example", cookie },
    body: JSON.stringify(createRecord()),
  });
  const plain = new Request("https://demo.test/api/sign", {
    method: "POST",
    headers: { "content-type": "text/plain", cookie },
    body: JSON.stringify(createRecord()),
  });
  assert.equal((await handleSign(foreign, deps)).status, 403);
  assert.equal((await handleSign(plain, deps)).status, 415);
  const sameOrigin = new Request("https://demo.test/api/sign", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://demo.test", cookie },
    body: JSON.stringify(createRecord()),
  });
  assert.equal((await handleSign(sameOrigin, deps)).status, 200);
  assert.equal(calls.length, 1);
});
