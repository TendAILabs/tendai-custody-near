import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ATTACK_INTRO, ATTACK_LIMIT, ATTACK_LINES, checkLabel, verificationRows } from "./proof.ts";

const BANNED = ["HIPAA compliant", "certified", "audited", "vulnerability-free", "\u2014"];

test("only the signature kind can pass until the server reports a gateway TCB", () => {
  const green = verificationRows({ teeStatus: "green", hasParsedReceipt: true, approveTxKnown: true });
  assert.equal(green.filter((row) => row.state === "pass").map((row) => row.id).join(), "signature");
  assert.equal(green.filter((row) => row.state === "not-checked").length, green.length - 1);
  assert.equal(checkLabel("not-checked"), "Not checked here");
  const idle = verificationRows({ teeStatus: "idle", hasParsedReceipt: false, approveTxKnown: false });
  assert.equal(idle[0]?.state, "not-run");
  const red = verificationRows({ teeStatus: "red", hasParsedReceipt: false, approveTxKnown: false });
  assert.equal(red[0]?.state, "fail");
  const checked = verificationRows({
    teeStatus: "green",
    hasParsedReceipt: true,
    approveTxKnown: true,
    evidence: {
      gatewayTcb: "UpToDate",
      gatewaySigner: "ed25519 fictional",
      gatewayTls: "attested",
      modelTcb: "UpToDate",
      modelGpu: "verified",
      modelSigner: "ed25519 fictional-model",
    },
  });
  assert.deepEqual(
    checked.filter((row) => row.state === "pass").map((row) => row.id),
    ["signature", "quote"],
  );
  for (const id of ["nonce", "binding", "rtmr", "compose", "models", "e2ee", "hashes", "chain"]) {
    assert.equal(checked.find((row) => row.id === id)?.state, "not-checked", id);
  }
  assert.match(checked.find((row) => row.id === "quote")?.detail ?? "", /NEAR AI SDK at call time/);
  assert.match(checked.find((row) => row.id === "models")?.detail ?? "", /stays unchecked/);
});

test("attack lines name where each result was recorded and do not claim a live run", () => {
  assert.equal(ATTACK_LINES.length, 11);
  assert.match(ATTACK_INTRO, /does not run the attacks/);
  assert.match(ATTACK_INTRO, /2026-11-14/);
  assert.doesNotMatch(ATTACK_INTRO, /skipped|2026-11-11/);
  assert.match(ATTACK_LIMIT, /already downloaded/);
  assert.equal(ATTACK_LINES.filter((line) => line.where.startsWith("On the testnet contract")).length, 8);
  assert.equal(ATTACK_LINES.filter((line) => line.tx).length, 8);
  const blob = `${ATTACK_INTRO}\n${ATTACK_LIMIT}\n${ATTACK_LINES.map((line) => `${line.text} ${line.tx ?? ""}`).join("\n")}`;
  for (const phrase of BANNED) assert.equal(blob.includes(phrase), false, phrase);
  assert.equal(blob.includes("rr6c9910d7"), false);
});

test("the verification screen source does not paint an unchecked row as Pass", () => {
  const source = readFileSync(new URL("../../components/wireframe/verified-drawer.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("VERIFIED_CHECKS"), false);
  assert.match(source, /Not checked here|checkLabel/);
  for (const phrase of BANNED) assert.equal(source.includes(phrase), false, phrase);
});
