import assert from "node:assert/strict";
import { test } from "node:test";
import { runAttackChecks } from "./attack-checks.ts";

const ENV_NAMES = [
  "RELAY_CONTRACT_ID",
  "CLINIC_A_ACCOUNT_ID",
  "CLINIC_A_FC_PRIVATE_KEY",
  "HOSPITAL_B_ACCOUNT_ID",
  "HOSPITAL_B_FC_PRIVATE_KEY",
  "SECOND_OPINION_ACCOUNT_ID",
  "SECOND_OPINION_FC_PRIVATE_KEY",
  "DEMO_PATIENT_ACCOUNT_ID",
  "DEMO_PATIENT_PRIVATE_KEY",
] as const;

const SYNTHETIC = {
  RELAY_CONTRACT_ID: "synthetic.relay.test",
  CLINIC_A_ACCOUNT_ID: "clinic-a.synthetic.test",
  CLINIC_A_FC_PRIVATE_KEY: "synthetic-clinic-fc-key",
  HOSPITAL_B_ACCOUNT_ID: "hospital-b.synthetic.test",
  HOSPITAL_B_FC_PRIVATE_KEY: "synthetic-hospital-fc-key",
  SECOND_OPINION_ACCOUNT_ID: "second.synthetic.test",
  SECOND_OPINION_FC_PRIVATE_KEY: "synthetic-second-fc-key",
  DEMO_PATIENT_ACCOUNT_ID: "patient.synthetic.test",
  DEMO_PATIENT_PRIVATE_KEY: "synthetic-patient-key",
};

const TX = "7".repeat(44);

function withSyntheticEnv<T>(run: () => Promise<T>, options?: { second?: boolean }): Promise<T> {
  const previous = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) {
    if (options?.second === false && name.startsWith("SECOND_OPINION")) {
      delete process.env[name];
      continue;
    }
    process.env[name] = SYNTHETIC[name];
  }
  return run().finally(() => {
    for (const name of ENV_NAMES) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test("runAttackChecks records a failed check instead of throwing", async () => {
  const marker = `ed25519:${"A".repeat(44)}`;
  await withSyntheticEnv(async () => {
    const report = await runAttackChecks({
      call: async () => {
        throw new Error(`sign failed ${marker}`);
      },
    });
    const failed = report.checks.at(-1);
    assert.equal(failed?.name, "create_record");
    assert.equal(failed?.pass, false);
    const detail = failed?.detail ?? "";
    assert.equal(detail.includes(marker), false);
    assert.equal(detail.includes("AAAA"), false);
    assert.match(detail, /ed25519:\[REDACTED\]/);
    assert.equal(/[{}`]/.test(detail), false);
  });
});

test("unauthorized open is the second opinion on a share granted only to the hospital", async () => {
  await withSyntheticEnv(async () => {
    const calls: { accountId: string; methodName: string; to?: string }[] = [];
    let hospitalOpens = 0;
    const report = await runAttackChecks({
      view: async () => ({ enc_pubkey: "cd".repeat(32) }),
      call: async (input) => {
        const to = typeof input.args.to === "string" ? input.args.to : undefined;
        calls.push({ accountId: input.accountId, methodName: input.methodName, to });
        if (input.methodName === "create_record") return { hash: TX, value: "1" };
        if (input.methodName === "request_referral") return { hash: TX, value: "2" };
        if (input.methodName === "request_open" && input.accountId === SYNTHETIC.SECOND_OPINION_ACCOUNT_ID) {
          throw new Error("Smart contract panicked: ERR_UNAUTHORIZED");
        }
        if (input.methodName === "approve_share") return { hash: TX, value: null };
        if (input.methodName === "request_open" && input.accountId === SYNTHETIC.HOSPITAL_B_ACCOUNT_ID) {
          hospitalOpens += 1;
          if (hospitalOpens === 1) return { hash: TX, value: null };
          throw new Error("Smart contract panicked: ERR_REVOKED");
        }
        if (input.methodName === "submit_reply") return { hash: TX, value: "3" };
        if (input.methodName === "revoke_share") return { hash: TX, value: null };
        throw new Error(`unexpected ${input.methodName}`);
      },
    });
    const referral = calls.find((item) => item.methodName === "request_referral");
    const unauthorizedCall = calls.find((item) => item.methodName === "request_open");
    const unauthorized = report.checks.find((item) => item.name === "unauthorized open");
    assert.equal(referral?.to, SYNTHETIC.HOSPITAL_B_ACCOUNT_ID);
    assert.equal(unauthorizedCall?.accountId, SYNTHETIC.SECOND_OPINION_ACCOUNT_ID);
    assert.equal(unauthorized?.pass, true);
    assert.equal(unauthorized?.detail, "ERR_UNAUTHORIZED");
    assert.equal(calls.some((item) => item.methodName === "request_open" && item.accountId === SYNTHETIC.CLINIC_A_ACCOUNT_ID), false);
    assert.equal(report.checks.every((check) => check.pass), true);
  });
});

test("unauthorized open falls back to a non-recipient that can call request_open", async () => {
  await withSyntheticEnv(async () => {
    const calls: { accountId: string; methodName: string; shareId?: string }[] = [];
    let revoked = false;
    const report = await runAttackChecks({
      view: async () => ({ enc_pubkey: "cd".repeat(32) }),
      call: async (input) => {
        const shareId = typeof input.args.share_id === "string" ? input.args.share_id : undefined;
        calls.push({ accountId: input.accountId, methodName: input.methodName, shareId });
        if (input.methodName === "create_record") return { hash: TX, value: "1" };
        if (input.methodName === "request_referral") {
          const to = input.args.to;
          return { hash: TX, value: to === SYNTHETIC.CLINIC_A_ACCOUNT_ID ? "9" : "2" };
        }
        if (input.methodName === "decline_share") return { hash: TX, value: null };
        if (input.methodName === "approve_share") return { hash: TX, value: null };
        if (input.methodName === "submit_reply") return { hash: TX, value: "3" };
        if (input.methodName === "revoke_share") {
          revoked = true;
          return { hash: TX, value: null };
        }
        if (input.methodName === "request_open" && shareId === "9") {
          throw new Error("wasm execution failed ERR_UNAUTHORIZED");
        }
        if (input.methodName === "request_open" && shareId === "2") {
          if (revoked) throw new Error("wasm execution failed ERR_REVOKED");
          return { hash: TX, value: null };
        }
        throw new Error(`unexpected ${input.methodName}`);
      },
    });
    const unauthorized = calls.find((call) => call.methodName === "request_open" && call.shareId === "9");
    assert.equal(unauthorized?.accountId, SYNTHETIC.HOSPITAL_B_ACCOUNT_ID);
    assert.equal(report.checks.find((check) => check.name === "unauthorized open")?.pass, true);
    assert.equal(
      calls.some((call) => call.methodName === "request_open" && call.accountId === SYNTHETIC.CLINIC_A_ACCOUNT_ID),
      false,
    );
    assert.equal(report.checks.every((check) => check.pass), true);
  }, { second: false });
});
