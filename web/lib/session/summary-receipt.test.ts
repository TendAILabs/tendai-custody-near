import assert from "node:assert/strict";
import { test } from "node:test";
import { isServerSummaryHash } from "../tee/summary-hash.ts";
import { canonicalSummaryHash } from "../tee/summary-receipt.ts";
import {
  SUMMARY_RECEIPT_TTL_MS,
  authorizeStoryMethod,
  finishSummaryReceipt,
  issueSummaryReceipt,
  newVisitorSession,
  readVisitorSession,
  releaseSummaryReceipt,
  writeVisitorCookie,
} from "./visitor.ts";

function hex(byte: number): string {
  return byte.toString(16).padStart(2, "0").repeat(32);
}

test("M1 the server summary hash is canonical and approve rejects any other 64-hex receipt", async () => {
  const left = JSON.stringify({
    tee: true,
    model: "m",
    signatureKind: "provider_tee",
    signer: "abc",
    signedText: "m:aa:bb",
  });
  const right = JSON.stringify({
    signedText: "m:aa:bb",
    signer: "abc",
    model: "m",
    signatureKind: "provider_tee",
    tee: true,
  });
  const hash = canonicalSummaryHash(left);
  assert.equal(hash, canonicalSummaryHash(right));
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, canonicalSummaryHash(left.replace("provider_tee", "gateway")));

  const session = newVisitorSession();
  session.shares.push("4");
  const issued = issueSummaryReceipt(session, "4", hash);
  assert.equal(issued?.receipt, hash);
  assert.equal(issued?.summaryHash, hash);
  const forged = await authorizeStoryMethod(session, "approve_share", { share_id: "4", tee_receipt_hash: "ff".repeat(32) });
  assert.equal(forged.ok, false);
  if (!forged.ok) assert.equal(forged.error, "receipt was not issued");
  assert.equal(session.summaries.length, 1);
  const allowed = await authorizeStoryMethod(session, "approve_share", { share_id: "4", tee_receipt_hash: hash.toUpperCase() });
  assert.equal(allowed.ok, true);
  const again = await authorizeStoryMethod(session, "approve_share", { share_id: "4", tee_receipt_hash: hash });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.status, 403);
});

test("M1 a summary receipt is bound to the share, expires, and is single-use", async () => {
  const now = Date.now();
  const session = newVisitorSession(now);
  session.shares.push("4", "8");
  const hash = hex(0x21);
  const first = issueSummaryReceipt(session, "4", hash, now);
  const second = issueSummaryReceipt(session, "4", hash, now + 5_000);
  assert.equal(first?.exp, second?.exp);
  assert.equal(session.summaries.length, 1);
  assert.equal(first && first.exp - now, SUMMARY_RECEIPT_TTL_MS);

  const otherShare = await authorizeStoryMethod(session, "approve_share", { share_id: "8", tee_receipt_hash: hash });
  assert.equal(otherShare.ok, false);
  if (!otherShare.ok) assert.equal(otherShare.error, "receipt was not issued");
  const decline = await authorizeStoryMethod(session, "decline_share", { share_id: "4" });
  assert.equal(decline.ok, true);

  session.summaries[0].summaryHash = hex(0x22);
  const mismatched = await authorizeStoryMethod(session, "approve_share", { share_id: "4", tee_receipt_hash: hash });
  assert.equal(mismatched.ok, false);
  session.summaries[0].summaryHash = hash;

  const secret = "summary-cookie-secret";
  const cookie = writeVisitorCookie(session, secret, false);
  const read = readVisitorSession(cookie.split(";")[0] ?? "", secret, now + 1_000);
  assert.equal(read?.summaries.length, 1);
  assert.equal(read?.summaries[0]?.shareId, "4");
  const fromCookie = await authorizeStoryMethod(read, "approve_share", { share_id: "4", tee_receipt_hash: hash });
  assert.equal(fromCookie.ok, true);
  assert.equal(issueSummaryReceipt(read!, "4", hash, now + 1_000), null);

  await releaseSummaryReceipt(read!, "4", hash, now + 1_000);
  const retried = await authorizeStoryMethod(read, "approve_share", { share_id: "4", tee_receipt_hash: hash });
  assert.equal(retried.ok, true);
  finishSummaryReceipt(read!, "4", hash);
  await releaseSummaryReceipt(read!, "4", hash, now + 1_000);
  const afterFinish = await authorizeStoryMethod(read, "approve_share", { share_id: "4", tee_receipt_hash: hash });
  assert.equal(afterFinish.ok, false);

  const expired = newVisitorSession();
  expired.shares.push("4");
  issueSummaryReceipt(expired, "4", hash, Date.now() - SUMMARY_RECEIPT_TTL_MS - 1_000);
  const late = await authorizeStoryMethod(expired, "approve_share", { share_id: "4", tee_receipt_hash: hash });
  assert.equal(late.ok, false);
  const renewed = issueSummaryReceipt(expired, "4", hash);
  assert.equal(renewed?.receipt, hash);
  assert.ok(renewed && renewed.exp > Date.now());
});

test("M1 a local string is not a server summary hash", () => {
  assert.equal(isServerSummaryHash("not-a-server-hash"), false);
  assert.equal(isServerSummaryHash("ab".repeat(32).toUpperCase()), false);
  assert.equal(isServerSummaryHash(hex(0x44)), true);
});
