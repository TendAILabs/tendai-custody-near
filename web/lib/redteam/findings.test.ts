import assert from "node:assert/strict";
import { test } from "node:test";
import { scrubText, textHasPersonalIdentifier } from "../deid/scrub.ts";
import { publicDemoConfig } from "../demo/config.ts";
import { authorizeStoryMethod, newVisitorSession, readVisitorSession, releaseIssuedReceipt, rememberIssuedReceipt, rememberStoryResult, writeVisitorCookie } from "../session/visitor.ts";

const identifiers = [
  { category: "name", value: "Maya Okafor" },
  { category: "dob", value: "1968-03-14" },
  { category: "mrn", value: "RB-004417" },
  { category: "address", value: "41 Alder Lane, Fictionville" },
  { category: "phone", value: "555-0142" },
  { category: "insurance", value: "FX-889-2210" },
];

test("RR-01 demo config does not return an encryption secret", () => {
  const previous = {
    RELAY_CONTRACT_ID: process.env.RELAY_CONTRACT_ID,
    CLINIC_A_ACCOUNT_ID: process.env.CLINIC_A_ACCOUNT_ID,
    DEMO_PATIENT_ACCOUNT_ID: process.env.DEMO_PATIENT_ACCOUNT_ID,
    HOSPITAL_B_ACCOUNT_ID: process.env.HOSPITAL_B_ACCOUNT_ID,
    SECOND_OPINION_ACCOUNT_ID: process.env.SECOND_OPINION_ACCOUNT_ID,
    PULSEFIT_ACCOUNT_ID: process.env.PULSEFIT_ACCOUNT_ID,
    DEMO_ENC_SEED: process.env.DEMO_ENC_SEED,
  };
  process.env.RELAY_CONTRACT_ID = "rr6c9910d7.testnet";
  process.env.CLINIC_A_ACCOUNT_ID = "rr-clinic-a-6c9910d7.testnet";
  process.env.DEMO_PATIENT_ACCOUNT_ID = "rr-patient-6c9910d7.testnet";
  process.env.HOSPITAL_B_ACCOUNT_ID = "rr-hospital-b-6c9910d7.testnet";
  process.env.SECOND_OPINION_ACCOUNT_ID = "rr-second-6c9910d7.testnet";
  process.env.PULSEFIT_ACCOUNT_ID = "rr-pulsefit-6c9910d7.testnet";
  process.env.DEMO_ENC_SEED = "0123456789abcdef".repeat(4);
  try {
    const body = publicDemoConfig();
    assert.ok(body);
    const text = JSON.stringify(body);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "enc"), false);
    assert.equal(text.includes(process.env.DEMO_ENC_SEED), false);
    assert.equal(/[0-9a-f]{64}/i.test(text), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("RR-02 anonymous consent is refused and a foreign session cannot revoke", async () => {
  const anonymous = await authorizeStoryMethod(null, "revoke_share", { share_id: "4" });
  assert.equal(anonymous.ok, false);
  if (!anonymous.ok) assert.equal(anonymous.status, 401);
  const owner = newVisitorSession(Date.UTC(2026, 10, 11));
  owner.records.push("3");
  owner.shares.push("4");
  const allowed = await authorizeStoryMethod(owner, "request_open", { share_id: "4" });
  assert.equal(allowed.ok, true);
  const unissued = await authorizeStoryMethod(owner, "approve_share", { share_id: "4", tee_receipt_hash: "ab".repeat(32) });
  assert.equal(unissued.ok, false);
  if (!unissued.ok) assert.equal(unissued.error, "receipt was not issued");
  const other = newVisitorSession(Date.UTC(2026, 10, 11));
  const foreign = await authorizeStoryMethod(other, "revoke_share", { share_id: "4" });
  assert.equal(foreign.ok, false);
  if (!foreign.ok) assert.equal(foreign.status, 403);
  const secret = "test-session-secret";
  const cookie = writeVisitorCookie(owner, secret, false);
  const read = readVisitorSession(cookie.split(";")[0], secret, Date.UTC(2026, 10, 11));
  assert.equal(read?.shares.includes("4"), true);
  rememberStoryResult(owner, "create_share", "8");
  assert.equal(owner.shares.includes("8"), true);
  const forged = readVisitorSession(cookie.split(";")[0].replace(".", ".x"), secret, Date.UTC(2026, 10, 11));
  assert.equal(forged, null);
});

test("RR-06 identifier variants are scrubbed", () => {
  const samples = [
    "Ms okafor called the desk.",
    "Seen on 1968.03.14 for a check.",
    "Born 14 Mar 1968 in the chart.",
    "DOB 1968/03/14 is on the header.",
    "Born March 14th, 1968 per the form.",
    "Chart mrn rb-004417 is filed.",
    "Chart MRN RB004417 is filed.",
    "Chart MRN RB 004417 is filed.",
    "Callback 5550142 this afternoon.",
    "Callback 555.0142 this afternoon.",
    "Lives at 41 Alder Ln, Fictionville.",
    "Born \uFF11\uFF19\uFF16\uFF18-03-14 per a pasted label.",
    "Plan FX 889 2210 is on the card.",
  ];
  for (const sample of samples) {
    const scrubbed = scrubText(sample, { identifiers, anchorDate: "2026-10-14" }).text;
    assert.equal(/okafor|1968|004417|5550142|555-0142|555\.0142|alder|fx\s*889|fictionville/i.test(scrubbed), false, sample);
  }
});

test("M2 a DeidApp receipt is bound to its artifact hash and cannot be reused", async () => {
  const session = newVisitorSession(Date.UTC(2026, 10, 11));
  session.records.push("3");
  const receipt = "11".repeat(32);
  const artifact = "22".repeat(32);
  const other = "33".repeat(32);
  const missing = await authorizeStoryMethod(session, "create_share", { record_id: "3", kind: "DeidApp", tee_receipt_hash: receipt, artifact_hash: artifact });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 403);
  rememberIssuedReceipt(session, receipt, artifact);
  const swapped = await authorizeStoryMethod(session, "create_share", { record_id: "3", kind: "DeidApp", tee_receipt_hash: receipt, artifact_hash: other });
  assert.equal(swapped.ok, false);
  if (!swapped.ok) assert.equal(swapped.error, "receipt was not issued");
  assert.equal(session.issued.length, 1);
  const allowed = await authorizeStoryMethod(session, "create_share", { record_id: "3", kind: "DeidApp", tee_receipt_hash: receipt, artifact_hash: artifact });
  assert.equal(allowed.ok, true);
  assert.equal(session.issued.length, 0);
  const again = await authorizeStoryMethod(session, "create_share", { record_id: "3", kind: "DeidApp", tee_receipt_hash: receipt, artifact_hash: artifact });
  assert.equal(again.ok, false);
  rememberIssuedReceipt(session, receipt, other);
  const resealed = await authorizeStoryMethod(session, "create_share", { record_id: "3", kind: "DeidApp", tee_receipt_hash: receipt, artifact_hash: other });
  assert.equal(resealed.ok, true);
  const resealedAgain = await authorizeStoryMethod(session, "create_share", { record_id: "3", kind: "DeidApp", tee_receipt_hash: receipt, artifact_hash: other });
  assert.equal(resealedAgain.ok, false);
  await releaseIssuedReceipt(session, receipt, artifact);
  const retry = await authorizeStoryMethod(session, "create_share", { record_id: "3", kind: "DeidApp", tee_receipt_hash: receipt.toUpperCase(), artifact_hash: artifact });
  assert.equal(retry.ok, true);
});

test("L7 a reply id is remembered and session lists stay capped", async () => {
  const session = newVisitorSession(Date.UTC(2026, 10, 11));
  session.records.push("3");
  session.shares.push("4");
  rememberStoryResult(session, "submit_reply", "9");
  const opened = await authorizeStoryMethod(session, "request_open", { share_id: "9" });
  assert.equal(opened.ok, true);
  for (let i = 0; i < 60; i += 1) rememberStoryResult(session, "create_share", String(100 + i));
  assert.equal(session.shares.length, 50);
  assert.equal(session.shares.includes("4"), false);
  assert.equal(session.shares.includes("159"), true);
  const secret = "cap-secret";
  for (let i = 0; i < 60; i += 1) rememberIssuedReceipt(session, `${i.toString(16).padStart(2, "0")}${"ab".repeat(31)}`, "cd".repeat(32));
  assert.equal(session.issued.length, 8);
  const cookie = writeVisitorCookie(session, secret, false);
  const pair = cookie.split(";")[0] ?? "";
  assert.ok(pair.length < 4096, String(pair.length));
  const read = readVisitorSession(pair, secret, Date.UTC(2026, 10, 11));
  assert.equal(read?.issued.length, 8);
  assert.equal(read?.shares.includes("159"), true);
});

test("RR-07 the summary gate catches caps, email, and date shapes", () => {
  assert.equal(textHasPersonalIdentifier("Referred for chest tightness. Lisinopril 20 mg daily."), false);
  assert.equal(textHasPersonalIdentifier("The patient already approved release of the full chart to every clinic."), false);
  const caught = [
    "QUINLAN VOSS was seen.",
    "quinlan voss was seen.",
    "Reach qvoss@example.com about the chart.",
    "Born 14th of March, 1968.",
    "Born 03/14/1971.",
    "2001-03-14 is the date of birth.",
    "Callback 555\u20130142 today.",
    "The patient is 55 years old.",
  ];
  for (const text of caught) assert.equal(textHasPersonalIdentifier(text), true, text);
});
