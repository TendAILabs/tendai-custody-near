import assert from "node:assert/strict";
import { test } from "node:test";
import { handleAssist } from "../assist/handler.ts";
import type { AssistModelResult } from "../assist/types.ts";
import { handleBlobPut } from "../blob/put-handler.ts";
import { memoryStore } from "../guard/visitor.ts";
import { handleSign, type SignCallInput } from "../near/sign-handler.ts";
import type { SignAccounts, SignRole } from "../near/sign-allow.ts";
import { readVisitorSession } from "../session/visitor.ts";
import { handleVisitorDemo } from "./demo.ts";
import { DEMO_SESSION_IP_LIMIT } from "./limits.ts";

delete process.env.RR_DEMO_SESSION_IP_LIMIT;
import { handleVisitorStatus } from "./status.ts";

const SECRET = "test-session-secret";
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const HEX = "ab".repeat(32);
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

function demoRequest(headers?: HeadersInit): Request {
  return new Request("https://demo.test/api/visitor/demo", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: "{}",
  });
}

test("a demo server choice issues a session and then blob, sign, and assist succeed", async () => {
  const store = memoryStore({ isolated: true });
  const anonymous = await handleVisitorStatus(new Request("https://demo.test/api/visitor"), {
    now: NOW,
    secret: SECRET,
    configured: false,
    demoPatient: ACCOUNTS.patient,
  });
  assert.equal(anonymous.headers.get("set-cookie"), null);

  const blockedType = await handleVisitorDemo(new Request("https://demo.test/api/visitor/demo", { method: "POST", body: "{}" }), {
    now: NOW,
    secret: SECRET,
    store,
    patientId: ACCOUNTS.patient,
  });
  assert.equal(blockedType.status, 415);
  const blockedOrigin = await handleVisitorDemo(
    demoRequest({ origin: "https://evil.example" }),
    { now: NOW, secret: SECRET, store, patientId: ACCOUNTS.patient },
  );
  assert.equal(blockedOrigin.status, 403);

  const issued = await handleVisitorDemo(demoRequest(), { now: NOW, secret: SECRET, store, patientId: ACCOUNTS.patient });
  assert.equal(issued.status, 200);
  const setCookie = issued.headers.get("set-cookie") ?? "";
  const session = readVisitorSession(setCookie, SECRET, NOW);
  assert.equal(session?.patient, ACCOUNTS.patient);
  assert.equal(session?.patientMode, "demo");
  const cookie = setCookie.split(";")[0] ?? "";

  const blob = await handleBlobPut(
    new Request("https://demo.test/api/blob", {
      method: "PUT",
      headers: { cookie, origin: "https://demo.test" },
      body: new Uint8Array([1, 2, 3]),
    }),
    {
      now: NOW,
      secret: SECRET,
      store,
      put: async () => HEX,
    },
  );
  assert.equal(blob.status, 201);

  const calls: SignCallInput[] = [];
  const signed = await handleSign(
    new Request("https://demo.test/api/sign", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        role: "clinic",
        method: "create_record",
        args: { patient: ACCOUNTS.patient, sections: [{ key: "history", cipher_hash: HEX }] },
      }),
    }),
    {
      now: NOW,
      secret: SECRET,
      store,
      accounts: ACCOUNTS,
      signers: SIGNERS,
      contractId: "rr6c9910d7.testnet",
      call: async (input) => {
        calls.push(input);
        return { hash: "TxHash11111111111111111111111111111111", value: "9" };
      },
    },
  );
  assert.equal(signed.status, 200);
  assert.equal(calls[0]?.accountId, ACCOUNTS.clinic);
  assert.equal(calls[0]?.args.patient, ACCOUNTS.patient);

  const answer: AssistModelResult = {
    text: "Revoke stops the next open.",
    signatureKind: "provider_tee",
    signer: "ed25519 test",
    requestHash: "ab".repeat(32),
    responseHash: "cd".repeat(32),
    receiptJson: JSON.stringify({
      tee: true,
      signatureKind: "provider_tee",
      signedText: `z-ai/glm-5.3-flash:${"ab".repeat(32)}:${"cd".repeat(32)}`,
    }),
  };
  const assist = await handleAssist(
    new Request("https://demo.test/api/assist", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ role: "patient", route: "/patient", messages: [{ role: "user", content: "What does revoke do?" }] }),
    }),
    { now: NOW, secret: SECRET, store, keyConfigured: true, answer: async () => answer },
  );
  assert.equal(assist.status, 200);
  const assistBody = (await assist.json()) as { text?: string };
  assert.match(assistBody.text ?? "", /Revoke stops the next open/);
});

test("the demo session route rate limits one address and does not use the faucet", async () => {
  const store = memoryStore({ isolated: true });
  const deps = { now: NOW, secret: SECRET, store, patientId: ACCOUNTS.patient };
  for (let i = 0; i < DEMO_SESSION_IP_LIMIT; i += 1) {
    const response = await handleVisitorDemo(demoRequest(), deps);
    assert.equal(response.status, 200, String(i));
  }
  const blocked = await handleVisitorDemo(demoRequest(), deps);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("set-cookie"), null);
  const body = (await blocked.json()) as { error?: string; retryAt?: string };
  assert.match(body.error ?? "", /Try again after/);
  assert.match(body.error ?? "", /UTC/);
  assert.equal(typeof body.retryAt, "string");
  assert.equal(blocked.headers.get("retry-after") !== null, true);
});
