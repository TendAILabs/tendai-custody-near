import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { bytesToBase64, recallCiphertext, rememberCiphertext } from "../blob/client-cache.ts";
import { COPY_UNAVAILABLE, COPY_UNAVAILABLE_MESSAGE } from "../open/copy.ts";
import {
  canonicalEnvelopeBytes,
  cipherHash,
  encryptEnvelope,
  type EnvelopeV1,
} from "../crypto/envelope.ts";
import { scrubText } from "../deid/scrub.ts";
import { MAYA, SECTION_BODY, type SectionKey } from "../fixtures.ts";
import { flipCiphertextByte, recipientPublicKey, rejectSwappedArtifact } from "./keys.ts";
import { textHasPersonalIdentifier } from "../deid/scrub.ts";
import { deidSendAllowed, verifiedPanelTone } from "./panel.ts";
import { readTeeEvidence, type TeeServerEvidence } from "../tee/evidence.ts";
import { isServerSummaryHash } from "../tee/summary-hash.ts";
import { filterSharesToSession } from "./session-shares.ts";
import { clientPatientSign } from "../wallet/client-signer.ts";
import { rpcPost } from "../near/rpc-fetch.ts";
import { custodyAad, encryptionContext, randomRequestId, type CreateMethodName } from "../near/context.ts";

export type DemoConfig = {
  contractId: string;
  accounts: { clinic: string; patient: string; hospital: string; second: string; app: string };
};

const IDENTIFIERS = [
  { category: "name", value: MAYA.name },
  { category: "dob", value: MAYA.dob },
  { category: "mrn", value: MAYA.mrn },
  { category: "address", value: MAYA.address },
  { category: "phone", value: MAYA.phone },
  { category: "insurance", value: MAYA.insurer },
];

let configPromise: Promise<DemoConfig> | null = null;

export function clearDemoConfigCache(): void {
  configPromise = null;
}

export function loadDemoConfig(): Promise<DemoConfig> {
  configPromise ??= fetch("/api/demo/config", { credentials: "same-origin" }).then(async (response) => {
    if (!response.ok) throw new Error("demo not configured");
    const body = (await response.json()) as DemoConfig;
    return { contractId: body.contractId, accounts: body.accounts };
  }).catch((error: unknown) => {
    configPromise = null;
    throw error;
  });
  return configPromise;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function chainPublic(contractId: string, accountId: string): Promise<Uint8Array> {
  let hex = "";
  for (let attempt = 0; attempt < 3 && !/^[0-9a-f]{64}$/i.test(hex); attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 700));
    try {
      const actor = await rpcView<{ enc_pubkey?: string } | null>(contractId, "get_actor", { account_id: accountId });
      hex = actor?.enc_pubkey ?? "";
    } catch {
      hex = "";
    }
  }
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("The testnet node did not return this account's encryption key. Try the step again.");
  const chosen = recipientPublicKey({ chainHex: hex, serverHex: null });
  return hexToBytes(chosen.publicKeyHex);
}

async function rpcView<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
  const { payload } = (await rpcPost({
    jsonrpc: "2.0",
    id: "view",
    method: "query",
    params: {
      request_type: "call_function",
      account_id: contractId,
      method_name: method,
      args_base64: btoa(JSON.stringify(args)),
      finality: "optimistic",
    },
  })) as { payload: { result?: { result?: number[]; error?: string } } };
  if (payload.result?.error) throw new Error("view failed");
  const text = new TextDecoder().decode(Uint8Array.from(payload.result?.result ?? []));
  return (text ? JSON.parse(text) : null) as T;
}

const PATIENT_METHODS = new Set(["approve_share", "decline_share", "create_share", "revoke_share", "revoke_all_for_record"]);
const CREATION_METHODS = new Set(["create_record", "request_referral", "create_share", "submit_reply"]);

async function postSign(role: string, method: string, args: Record<string, unknown>): Promise<{ ok: boolean; hash: string; value: unknown; error: string }> {
  if (role === "patient" && PATIENT_METHODS.has(method)) {
    try {
      const signed = await clientPatientSign(method, args, "1");
      return { ok: true, hash: signed.hash, value: signed.value, error: "" };
    } catch (error) {
      return { ok: false, hash: "", value: null, error: error instanceof Error ? error.message : "sign failed" };
    }
  }
  const response = await fetch("/api/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ role, method, args }),
  });
  const body = (await response.json()) as { hash?: string; value?: unknown; error?: string };
  if (!response.ok) return { ok: false, hash: "", value: null, error: body.error ?? "sign failed" };
  return { ok: true, hash: body.hash ?? "", value: body.value, error: "" };
}

async function sign(role: string, method: string, args: Record<string, unknown>): Promise<{ hash: string; value: unknown }> {
  const first = await postSign(role, method, args);
  if (!first.ok && first.error === "sign failed" && CREATION_METHODS.has(method)) {
    const second = await postSign(role, method, args);
    if (!second.ok) throw new Error(second.error || "sign failed");
    return { hash: second.hash, value: second.value };
  }
  if (!first.ok) throw new Error(first.error || "sign failed");
  return { hash: first.hash, value: first.value };
}

async function recordEpoch(contractId: string, recordId: string): Promise<string> {
  const record = await rpcView<{ grant_epoch?: string } | null>(contractId, "get_record", { record_id: recordId });
  const epoch = record?.grant_epoch;
  if (!epoch) throw new Error("record epoch missing");
  return epoch;
}

async function putBlob(bytes: Uint8Array): Promise<string> {
  const response = await fetch("/api/blob", { method: "PUT", body: bytes as BodyInit, credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "This browser does not have Maya's session yet. Choose Use the demo server account on her page, and then try again."
        : "The encrypted copy could not be saved. Try the send again.",
    );
  }
  const payload = (await response.json()) as { hash: string };
  const hash = payload.hash ?? "";
  if (!rememberCiphertext(hash, bytesToBase64(bytes))) {
    throw new Error("This browser could not keep the encrypted copy. Try the send again.");
  }
  return hash;
}

export async function sendClinicReferral(sections: SectionKey[], purpose: string): Promise<{ tx: string; recordTx: string; recordId: string; shareId: string }> {
  const statusResponse = await fetch("/api/visitor", { credentials: "same-origin" });
  if (statusResponse.ok) {
    const status = (await statusResponse.json()) as { kind?: string };
    if (status.kind === "unbound") throw new Error("Set up Maya's account on her page and choose Try instantly or Use my wallet before Riverbend Family Clinic sends.");
  }
  const config = await loadDemoConfig();
  const patientKey = await chainPublic(config.contractId, config.accounts.patient);
  const clinicKey = await chainPublic(config.contractId, config.accounts.clinic);
  const recordRequest = randomRequestId();
  const referralRequest = randomRequestId();
  const recordContext = encryptionContext({
    contractId: config.contractId,
    caller: config.accounts.clinic,
    method: "CreateRecord",
    requestId: recordRequest,
  });
  const referralContext = encryptionContext({
    contractId: config.contractId,
    caller: config.accounts.clinic,
    method: "RequestReferral",
    requestId: referralRequest,
  });
  const recipients = [
    { account_id: config.accounts.patient, publicKey: patientKey },
    { account_id: config.accounts.clinic, publicKey: clinicKey },
  ];
  const metas = [];
  for (const key of sections) {
    const envelope = encryptEnvelope({
      plaintext: new TextEncoder().encode(SECTION_BODY[key]),
      aad: custodyAad({
        contractId: config.contractId,
        creator: config.accounts.clinic,
        contextHex: recordContext,
        artifactType: "record-section",
        section: key,
      }),
      recipients,
    });
    metas.push({ key, cipher_hash: await putBlob(canonicalEnvelopeBytes(envelope)) });
  }
  const purposeEnvelope = encryptEnvelope({
    plaintext: new TextEncoder().encode(purpose),
    aad: custodyAad({
      contractId: config.contractId,
      creator: config.accounts.clinic,
      contextHex: referralContext,
      artifactType: "referral-purpose",
    }),
    recipients: [{ account_id: config.accounts.patient, publicKey: patientKey }],
  });
  const created = await sign("clinic", "create_record", {
    request_id: recordRequest,
    patient: config.accounts.patient,
    sections: metas,
  });
  const recordId = String(created.value ?? "");
  if (!/^[1-9][0-9]*$/.test(recordId)) throw new Error("record id missing");
  const epoch = await recordEpoch(config.contractId, recordId);
  const referral = await sign("clinic", "request_referral", {
    request_id: referralRequest,
    record_id: recordId,
    expected_epoch: epoch,
    to: config.accounts.hospital,
    requested_sections: sections,
    purpose_hash: cipherHash(purposeEnvelope),
  });
  return { tx: referral.hash || created.hash, recordTx: created.hash, recordId, shareId: String(referral.value) };
}

export async function runTeeSummary(
  sections: SectionKey[],
  shareId: string,
): Promise<{ ok: boolean; note: string; text: string; receipt: string; receiptHash: string; latencyMs: number; evidence: TeeServerEvidence | null }> {
  const chart = sections.map((key) => SECTION_BODY[key]).join("\n");
  const response = await fetch("/api/tee/summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ chart, shareId }),
  });
  const body = (await response.json()) as {
    error?: string;
    text?: string;
    signatureKind?: string;
    receiptJson?: string;
    receiptHash?: string;
    latencyMs?: number;
    gatewayTcb?: string;
    gatewaySigner?: string;
    gatewayTls?: string;
    modelTcb?: string;
    modelGpu?: string;
    modelSigner?: string;
  };
  const receiptHash = body.receiptHash ?? "";
  const evidence = readTeeEvidence(body);
  const tone = verifiedPanelTone({ signatureKind: body.signatureKind });
  if (!response.ok || tone !== "green" || !isServerSummaryHash(receiptHash)) {
    return { ok: false, note: body.error ?? "verify failed", text: "", receipt: "", receiptHash: "", latencyMs: body.latencyMs ?? 0, evidence: null };
  }
  return {
    ok: true,
    note: body.signatureKind ?? "provider_tee",
    text: body.text ?? "",
    receipt: body.receiptJson ?? "",
    receiptHash,
    latencyMs: body.latencyMs ?? 0,
    evidence,
  };
}

export async function approveReferral(input: {
  recordId: string;
  shareId: string;
  sections: SectionKey[];
  days: number;
  readOnly: boolean;
  receiptHash: string;
}): Promise<{ tx: string; artifactHash: string }> {
  const config = await loadDemoConfig();
  const hospitalKey = await chainPublic(config.contractId, config.accounts.hospital);
  const patientKey = await chainPublic(config.contractId, config.accounts.patient);
  const artifact = encryptEnvelope({
    plaintext: new TextEncoder().encode(
      JSON.stringify({
        tee: true,
        sections: Object.fromEntries(input.sections.map((key) => [key, SECTION_BODY[key]])),
      }),
    ),
    aad: `${input.shareId}|artifact|v1`,
    recipients: [
      { account_id: config.accounts.hospital, publicKey: hospitalKey },
      { account_id: config.accounts.patient, publicKey: patientKey },
    ],
  });
  const artifactHash = await putBlob(canonicalEnvelopeBytes(artifact));
  const expiry = (BigInt(Date.now()) * BigInt(1_000_000) + BigInt(input.days) * BigInt(86_400) * BigInt(1_000_000_000)).toString();
  if (!isServerSummaryHash(input.receiptHash)) throw new Error("Run the summary again before approving.");
  const approved = await sign("patient", "approve_share", {
    share_id: input.shareId,
    granted_sections: input.sections,
    expires_at_ns: expiry,
    read_only: input.readOnly,
    artifact_hash: artifactHash,
    tee_receipt_hash: input.receiptHash,
  });
  return { tx: approved.hash, artifactHash };
}

function bytesFromBase64(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  try {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function tamperEnvelopeHashes(shareId: string): Promise<{ approved: string; presented: string | null }> {
  const config = await loadDemoConfig();
  const share = await rpcView<{ artifact_hash?: string } | null>(config.contractId, "get_share", { share_id: shareId });
  const approved = share?.artifact_hash ?? "";
  if (!approved) return { approved: "", presented: null };
  const cached = recallCiphertext(approved);
  let raw: Uint8Array | null = cached ? bytesFromBase64(cached) : null;
  if (!raw) {
    const response = await fetch(`/api/blob?hash=${approved}`);
    if (!response.ok) return { approved, presented: null };
    raw = new Uint8Array(await response.arrayBuffer());
  }
  const envelope = JSON.parse(new TextDecoder().decode(raw)) as EnvelopeV1;
  const flipped: EnvelopeV1 = { ...envelope, ciphertext: flipCiphertextByte(envelope.ciphertext) };
  return { approved, presented: cipherHash(flipped) };
}

export async function openShare(
  role: "hospital" | "second" | "app",
  shareId: string,
  options?: { tamper?: boolean },
): Promise<{ hash: string; text: string }> {
  const config = await loadDemoConfig();
  const accountId = config.accounts[role];
  const share = await rpcView<{ artifact_hash?: string } | null>(config.contractId, "get_share", { share_id: shareId });
  const artifactHash = share?.artifact_hash ?? "";
  const cached = artifactHash ? recallCiphertext(artifactHash) : null;
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const nonceHex = bytesToHex(nonce);
  const nonceHash = bytesToHex(sha256(nonce));
  const ticket = await sign(role, "request_open", { share_id: shareId, nonce_hash: nonceHash });
  let opened: Response | null = null;
  let body: { error?: string; text?: string; envelopes?: { body_base64: string }[] } = {};
  const started = Date.now();
  do {
    opened = await fetch("/api/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        share_id: shareId,
        account_id: accountId,
        nonce: nonceHex,
        ...(cached ? { envelopes: [{ hash: artifactHash, body_base64: cached }] } : {}),
      }),
    });
    body = (await opened.json()) as { error?: string; text?: string; envelopes?: { body_base64: string }[] };
    if (opened.ok || body.error !== "no-ticket" || Date.now() - started > 15_000) break;
    await new Promise((resolve) => setTimeout(resolve, 400));
  } while (true);
  if (!opened?.ok) {
    throw new Error(body.error === "revoked" ? "ERR_REVOKED" : body.error === COPY_UNAVAILABLE ? COPY_UNAVAILABLE_MESSAGE : body.error ?? "open failed");
  }
  const raw = body.envelopes?.[0]?.body_base64 ?? "";
  const envelope = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw), (char) => char.charCodeAt(0)))) as EnvelopeV1;
  const served = options?.tamper ? { ...envelope, ciphertext: flipCiphertextByte(envelope.ciphertext) } : envelope;
  if (artifactHash) rejectSwappedArtifact(cipherHash(served), artifactHash);
  if (options?.tamper) throw new Error("envelope swap");
  if (!body.text) throw new Error("open failed");
  return { hash: ticket.hash, text: body.text };
}

export async function sendSecondOpinion(
  recordId: string,
  parent: string,
  sections: SectionKey[],
  days: number,
): Promise<{ tx: string; shareId: string }> {
  const chosen = sections.length > 0 ? sections : (["imaging", "notes"] as SectionKey[]);
  const config = await loadDemoConfig();
  const secondKey = await chainPublic(config.contractId, config.accounts.second);
  const patientKey = await chainPublic(config.contractId, config.accounts.patient);
  const requestId = randomRequestId();
  const context = encryptionContext({
    contractId: config.contractId,
    caller: config.accounts.patient,
    method: "CreateShare",
    requestId,
  });
  const artifact = encryptEnvelope({
    plaintext: new TextEncoder().encode(
      JSON.stringify({
        sections: Object.fromEntries(chosen.map((key) => [key, SECTION_BODY[key]])),
      }),
    ),
    aad: custodyAad({
      contractId: config.contractId,
      creator: config.accounts.patient,
      contextHex: context,
      artifactType: "share-artifact",
    }),
    recipients: [
      { account_id: config.accounts.second, publicKey: secondKey },
      { account_id: config.accounts.patient, publicKey: patientKey },
    ],
  });
  const hash = await putBlob(canonicalEnvelopeBytes(artifact));
  const expiry = (BigInt(Date.now()) * BigInt(1_000_000) + BigInt(days) * BigInt(86_400) * BigInt(1_000_000_000)).toString();
  const epoch = await recordEpoch(config.contractId, recordId);
  const created = await sign("patient", "create_share", {
    request_id: requestId,
    record_id: recordId,
    expected_epoch: epoch,
    to: config.accounts.second,
    kind: "SecondOpinion",
    sections: chosen,
    expires_at_ns: expiry,
    read_only: true,
    purpose_hash: hash,
    artifact_hash: hash,
    tee_receipt_hash: null,
    parent,
  });
  const shareId = String(created.value ?? "");
  if (!/^[1-9][0-9]*$/.test(shareId)) throw new Error("share id missing");
  return { tx: created.hash, shareId };
}

export function previewDeid(): { before: string; after: string; allowed: boolean } {
  const before = `${MAYA.name} born ${MAYA.dob}, MRN ${MAYA.mrn}, ${MAYA.address}, ${MAYA.phone}, ${MAYA.insurer}. ${SECTION_BODY.history} ${SECTION_BODY.labs}`;
  const scrubbed = scrubText(before, { identifiers: IDENTIFIERS, anchorDate: "2026-10-14" });
  const allowed = deidSendAllowed({
    scrubbed: scrubbed.text,
    identifiers: IDENTIFIERS.map((item) => item.value),
    spans: [],
  });
  return { before, after: scrubbed.text, allowed };
}

export async function sendDeid(recordId: string, after: string, receiptHash: string, artifactHash: string): Promise<{ tx: string; shareId: string }> {
  const checked = scrubText(after, { identifiers: IDENTIFIERS, anchorDate: "2026-10-14" }).text;
  const bound = bytesToHex(sha256(new TextEncoder().encode(after)));
  if (checked !== after || textHasPersonalIdentifier(after) || bound !== receiptHash || !/^[0-9a-f]{64}$/.test(artifactHash)) {
    throw new Error("leak scan blocked the share");
  }
  const config = await loadDemoConfig();
  const requestId = randomRequestId();
  const expiry = (BigInt(Date.now()) * BigInt(1_000_000) + BigInt(30) * BigInt(86_400) * BigInt(1_000_000_000)).toString();
  const epoch = await recordEpoch(config.contractId, recordId);
  const created = await sign("patient", "create_share", {
    request_id: requestId,
    record_id: recordId,
    expected_epoch: epoch,
    to: config.accounts.app,
    kind: "DeidApp",
    sections: [],
    expires_at_ns: expiry,
    read_only: true,
    purpose_hash: artifactHash,
    artifact_hash: artifactHash,
    tee_receipt_hash: receiptHash,
    parent: null,
  });
  return { tx: created.hash, shareId: String(created.value) };
}

export async function submitConsult(role: "hospital" | "second", shareId: string, note: string): Promise<string> {
  const config = await loadDemoConfig();
  const patientKey = await chainPublic(config.contractId, config.accounts.patient);
  const senderId = config.accounts[role];
  const senderKey = await chainPublic(config.contractId, senderId);
  const share = await rpcView<{ record_id?: string } | null>(config.contractId, "get_share", { share_id: shareId });
  const recordId = share?.record_id ?? "";
  if (!recordId) throw new Error("record id missing");
  const requestId = randomRequestId();
  const context = encryptionContext({
    contractId: config.contractId,
    caller: senderId,
    method: "SubmitReply" satisfies CreateMethodName,
    requestId,
  });
  const envelope = encryptEnvelope({
    plaintext: new TextEncoder().encode(note),
    aad: custodyAad({
      contractId: config.contractId,
      creator: senderId,
      contextHex: context,
      artifactType: "reply-artifact",
    }),
    recipients: [
      { account_id: config.accounts.patient, publicKey: patientKey },
      { account_id: senderId, publicKey: senderKey },
    ],
  });
  const hash = await putBlob(canonicalEnvelopeBytes(envelope));
  const epoch = await recordEpoch(config.contractId, recordId);
  const submitted = await sign(role, "submit_reply", {
    request_id: requestId,
    share_id: shareId,
    expected_epoch: epoch,
    reply_hash: hash,
  });
  return submitted.hash;
}

export async function revokeShare(shareId: string): Promise<string> {
  const revoked = await sign("patient", "revoke_share", { share_id: shareId });
  return revoked.hash;
}

export async function declineShare(shareId: string): Promise<string> {
  const declined = await sign("patient", "decline_share", { share_id: shareId });
  return declined.hash;
}

export async function revokeAllForRecord(recordId: string): Promise<string> {
  const config = await loadDemoConfig();
  const epoch = await recordEpoch(config.contractId, recordId);
  const revoked = await sign("patient", "revoke_all_for_record", { record_id: recordId, expected_epoch: epoch });
  return revoked.hash;
}

type PendingRow = { id: string };

export async function pendingForSession(accountId: string, sessionIds: string[]): Promise<string[]> {
  const config = await loadDemoConfig();
  const rows = await rpcView<PendingRow[]>(config.contractId, "list_pending_for_patient", {
    patient: accountId,
    from_index: 0,
    limit: 50,
  });
  return filterSharesToSession(rows ?? [], sessionIds).map((row) => String(row.id));
}

export async function sharesForRecipient(role: "hospital" | "second" | "app", sessionIds: string[]): Promise<string[]> {
  const config = await loadDemoConfig();
  const rows = await rpcView<PendingRow[]>(config.contractId, "list_shares_for_recipient", {
    account_id: config.accounts[role],
    from_index: 0,
    limit: 50,
  });
  return filterSharesToSession(rows ?? [], sessionIds).map((row) => String(row.id));
}

