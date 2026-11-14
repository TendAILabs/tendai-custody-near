import assert from "node:assert/strict";
import { test } from "node:test";
import { activityCsv, buildActivity, filterRows, formatEventTime, stillHasAccess, type TxBook } from "./activity.ts";
import type { ChainActor, ChainEvent, ChainShareFull } from "./custody.ts";

const NS = "1700000000000000000";
const TX = "5NU1XrRVKaYfjnfQ7Az378k9A2xC7CQPH4VocuwDXPQG";
const OPEN = "8N3Mit9geBcTUhZqkDbsRJk4GL82pvdVRBriyfpXyEZm";

const actors: ChainActor[] = [
  { account_id: "clinic.testnet", role: "Clinic", display_name: "Riverbend Family Clinic", active: true, enc_pubkey: "" },
  { account_id: "patient.testnet", role: "Patient", display_name: "Patient", active: true, enc_pubkey: "" },
  { account_id: "hospital.testnet", role: "Clinic", display_name: "St. Aster General", active: true, enc_pubkey: "" },
  { account_id: "app.testnet", role: "App", display_name: "PulseFit", active: true, enc_pubkey: "" },
];

function share(partial: Partial<ChainShareFull> & Pick<ChainShareFull, "id" | "kind" | "to">): ChainShareFull {
  return {
    record_id: "59",
    parent: null,
    initiator: "patient.testnet",
    effective_status: "Active",
    artifact_hash: null,
    open_count: 0,
    status: "Active",
    expires_at_ns: null,
    tee_receipt_hash: null,
    read_only: true,
    last_opened_ns: null,
    granted_sections: [],
    created_at_ns: null,
    consented_at_ns: null,
    revoked_at_ns: null,
    ...partial,
  };
}

const book: TxBook = {
  referralTx: TX,
  consentTx: null,
  hospitalOpenTx: OPEN,
  consultTx: "stub-tx-reply-42aa019",
  secondTx: null,
  secondReplyTx: null,
  deidTx: null,
  revokeTx: TX,
  shareId: "103",
  secondShareId: null,
  deidShareId: "109",
};

test("local time keeps a zone label and follows the requested zone", () => {
  const bangkok = formatEventTime(NS, "Asia/Bangkok");
  const york = formatEventTime(NS, "America/New_York");
  assert.match(bangkok.zone, /GMT\+7|ICT/);
  assert.match(york.zone, /GMT-5|EST/);
  assert.notEqual(bangkok.time, york.time);
  assert.match(`${bangkok.time} ${bangkok.zone}`, /\d{2}:\d{2} /);
});

test("each event is a plain sentence, with a real transaction link or an account link", () => {
  const events: ChainEvent[] = [
    { at_ns: NS, actor: "clinic.testnet", kind: "referral_requested", share_id: "103", detail_hash: null },
    { at_ns: String(BigInt(NS) + BigInt(1)), actor: "hospital.testnet", kind: "share_opened", share_id: "103", detail_hash: null },
    { at_ns: String(BigInt(NS) + BigInt(2)), actor: "patient.testnet", kind: "share_revoked", share_id: "103", detail_hash: null },
    { at_ns: String(BigInt(NS) + BigInt(3)), actor: "hospital.testnet", kind: "reply_submitted", share_id: "200", detail_hash: null },
  ];
  const shares = [
    share({ id: "103", kind: "Referral", to: "hospital.testnet", open_count: 1 }),
    share({ id: "200", kind: "Reply", to: "patient.testnet", parent: "103", initiator: "hospital.testnet" }),
  ];
  const rows = buildActivity(events, shares, actors, book, "rr6c9910d7.testnet", { timeZone: "UTC" });
  assert.match(rows[0]?.sentence ?? "", /Riverbend Family Clinic asked St\. Aster Hospital/);
  assert.equal(rows[0]?.explorer.kind, "tx");
  assert.match(rows[0]?.explorer.href ?? "", /testnet\.nearblocks\.io\/txns\//);
  assert.equal(rows[1]?.sentence, "St. Aster Hospital opened the share.");
  assert.equal(rows[2]?.role, "Patient · Maya Okafor");
  assert.equal(rows[1]?.tx, OPEN);
  assert.match(rows[2]?.detail ?? "", /already downloaded/);
  assert.equal(rows[2]?.role.startsWith("Patient"), true);
  assert.equal(rows[3]?.tx, null);
  assert.equal(rows[3]?.explorer.kind, "account");
  assert.equal(rows[3]?.holderId, "hospital.testnet");
  const csv = activityCsv(rows);
  assert.match(csv, /time_zone/);
  assert.equal(csv.includes("explorer.testnet.near.org"), false);
});

test("one saved revoke hash is attached only to the latest revoke", () => {
  const events: ChainEvent[] = [
    { at_ns: NS, actor: "patient.testnet", kind: "share_revoked", share_id: "103", detail_hash: null },
    { at_ns: String(BigInt(NS) + BigInt(5)), actor: "patient.testnet", kind: "share_revoked", share_id: "109", detail_hash: null },
  ];
  const shares = [
    share({ id: "103", kind: "Referral", to: "hospital.testnet", effective_status: "Revoked" }),
    share({ id: "109", kind: "DeidApp", to: "app.testnet", effective_status: "Revoked" }),
  ];
  const rows = buildActivity(events, shares, actors, book, "rr6c9910d7.testnet", { formatTime: false });
  assert.equal(rows[0]?.tx, null);
  assert.equal(rows[1]?.tx, TX);
});

test("the chart-created row keeps the create_record hash", () => {
  const events: ChainEvent[] = [{ at_ns: NS, actor: "clinic.testnet", kind: "record_created", share_id: null, detail_hash: null }];
  const rows = buildActivity(events, [], actors, { ...book, recordTx: "createhashcreatehashcreatehashcreatehashcc" }, "rr6c9910d7.testnet", { formatTime: false });
  assert.equal(rows[0]?.tx, "createhashcreatehashcreatehashcreatehashcc");
  assert.equal(rows[0]?.explorer.kind, "tx");
});

test("filters keep a holder and a kind, and access review skips replies", () => {
  const events: ChainEvent[] = [
    { at_ns: NS, actor: "patient.testnet", kind: "share_created", share_id: "109", detail_hash: null },
    { at_ns: String(BigInt(NS) + BigInt(1)), actor: "clinic.testnet", kind: "referral_requested", share_id: "103", detail_hash: null },
  ];
  const shares = [
    share({ id: "103", kind: "Referral", to: "hospital.testnet" }),
    share({ id: "109", kind: "DeidApp", to: "app.testnet" }),
    share({ id: "200", kind: "Reply", to: "patient.testnet", parent: "103" }),
    share({ id: "201", kind: "Referral", to: "hospital.testnet", effective_status: "Revoked" }),
  ];
  const rows = buildActivity(events, shares, actors, { ...book, deidTx: null }, "rr6c9910d7.testnet", { formatTime: false });
  assert.equal(filterRows(rows, "app.testnet", "all").length, 1);
  assert.equal(filterRows(rows, "all", "referral_requested").length, 1);
  assert.deepEqual(stillHasAccess(shares).map((item) => item.id), ["103", "109"]);
});
