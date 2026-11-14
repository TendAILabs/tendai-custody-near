import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { canonicalU64 } from "../ids.ts";
import { isAccountId } from "../near/sign-allow.ts";
import { authorizationDomain, domainTag } from "./domain.ts";
import { sharedOnce } from "../store/once.ts";

export const VISITOR_COOKIE = "rr_visitor";
const MAX_AGE_SECONDS = 12 * 60 * 60;
const LIST_CAP = 50;
const ISSUED_CAP = 8;
const SUMMARY_CAP = 4;
export const SUMMARY_RECEIPT_TTL_MS = 10 * 60 * 1000;

export type IssuedReceipt = {
  receipt: string;
  artifact: string;
};

export type SummaryReceipt = {
  shareId: string;
  summaryHash: string;
  receipt: string;
  exp: number;
};

export type PatientMode = "" | "local" | "wallet" | "demo";

export type VisitorSession = {
  sid: string;
  records: string[];
  shares: string[];
  issued: IssuedReceipt[];
  summaries: SummaryReceipt[];
  exp: number;
  patient: string;
  patientMode: PatientMode;
  fundingTx: string;
  encPubkey: string;
  challengeNonce: string;
  challengeExp: number;
};

const SHARE_METHODS = new Set(["approve_share", "decline_share", "revoke_share", "request_open", "submit_reply"]);
const RECORD_METHODS = new Set(["request_referral", "create_share", "revoke_all_for_record", "request_owner_open"]);
const HASH = /^[0-9a-f]{64}$/;
const spentReceipts = new Set<string>();
const spentSummaries = new Set<string>();
const claimedSummaries = new Map<string, SummaryReceipt>();

function mac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(`${authorizationDomain()}\n${payload}`).digest("base64url");
}

export function newVisitorSession(now = Date.now()): VisitorSession {
  return {
    sid: randomBytes(16).toString("hex"),
    records: [],
    shares: [],
    issued: [],
    summaries: [],
    exp: now + MAX_AGE_SECONDS * 1000,
    patient: "",
    patientMode: "",
    fundingTx: "",
    encPubkey: "",
    challengeNonce: "",
    challengeExp: 0,
  };
}

export function writeVisitorCookie(session: VisitorSession, secret: string, secure: boolean): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const sig = mac(secret, payload);
  const parts = [`${VISITOR_COOKIE}=${payload}.${sig}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${MAX_AGE_SECONDS}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function capIds(values: string[]): string[] {
  const ids = values.filter((item) => typeof item === "string" && item.length > 0 && item.length <= 64);
  return ids.length > LIST_CAP ? ids.slice(ids.length - LIST_CAP) : ids;
}

function canonicalIds(values: unknown[]): string[] {
  const ids: string[] = [];
  for (const value of values) {
    const id = canonicalU64(value);
    if (id) ids.push(id);
  }
  return capIds(ids);
}

function readIssued(value: unknown): IssuedReceipt[] {
  if (!Array.isArray(value)) return [];
  const out: IssuedReceipt[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const receipt = (item as { receipt?: unknown }).receipt;
    const artifact = (item as { artifact?: unknown }).artifact;
    if (typeof receipt !== "string" || typeof artifact !== "string") continue;
    const normalizedReceipt = receipt.toLowerCase();
    const normalizedArtifact = artifact.toLowerCase();
    if (!HASH.test(normalizedReceipt) || !HASH.test(normalizedArtifact)) continue;
    out.push({ receipt: normalizedReceipt, artifact: normalizedArtifact });
  }
  return out.length > ISSUED_CAP ? out.slice(out.length - ISSUED_CAP) : out;
}

export function readVisitorSession(cookieHeader: string | null, secret: string, now = Date.now()): VisitorSession | null {
  if (!cookieHeader || !secret) return null;
  const pair = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${VISITOR_COOKIE}=`));
  if (!pair) return null;
  const token = pair.slice(VISITOR_COOKIE.length + 1);
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = mac(secret, payload);
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<VisitorSession>;
    if (!parsed || typeof parsed.sid !== "string" || typeof parsed.exp !== "number" || parsed.exp < now) return null;
    const records = canonicalIds(Array.isArray(parsed.records) ? parsed.records : []);
    const shares = canonicalIds(Array.isArray(parsed.shares) ? parsed.shares : []);
    const issued = readIssued(parsed.issued);
    const summaries = readSummaries(parsed.summaries, now);
    const patient = readAccount(parsed.patient);
    const patientMode: PatientMode =
      patient && (parsed.patientMode === "local" || parsed.patientMode === "wallet" || parsed.patientMode === "demo") ? parsed.patientMode : "";
    const fundingTx = typeof parsed.fundingTx === "string" && /^[1-9A-HJ-NP-Za-km-z]{10,88}$/.test(parsed.fundingTx) ? parsed.fundingTx : "";
    const encPubkey = typeof parsed.encPubkey === "string" && /^[0-9a-f]{64}$/.test(parsed.encPubkey) ? parsed.encPubkey : "";
    const challengeNonce = typeof parsed.challengeNonce === "string" && /^[A-Za-z0-9_-]{20,128}$/.test(parsed.challengeNonce) ? parsed.challengeNonce : "";
    const challengeExp = typeof parsed.challengeExp === "number" && Number.isFinite(parsed.challengeExp) ? parsed.challengeExp : 0;
    return { sid: parsed.sid, records, shares, issued, summaries, exp: parsed.exp, patient, patientMode, fundingTx, encPubkey, challengeNonce, challengeExp };
  } catch {
    return null;
  }
}

function rememberId(list: string[], id: string): void {
  if (!id || list.includes(id)) return;
  list.push(id);
  if (list.length > LIST_CAP) list.splice(0, list.length - LIST_CAP);
}

function spendKey(session: VisitorSession, receipt: string, artifact: string): string {
  return `receipt:${domainTag()}:${session.sid}:${receipt}:${artifact}`;
}

export async function authorizeStoryMethod(
  session: VisitorSession | null,
  method: string,
  args: Record<string, unknown>,
  now = Date.now(),
): Promise<{ ok: true } | { ok: false; status: 401 | 403; error: string }> {
  if (!session) return { ok: false, status: 401, error: "sign in required" };
  const share = canonicalU64(args.share_id) ?? "";
  const record = canonicalU64(args.record_id) ?? "";
  if (SHARE_METHODS.has(method)) {
    if (!share || !session.shares.includes(share)) return { ok: false, status: 403, error: "not this session" };
    if (method === "approve_share") {
      const receipt = typeof args.tee_receipt_hash === "string" ? args.tee_receipt_hash.toLowerCase() : "";
      if (!(await claimSummaryReceipt(session, share, receipt, now))) return { ok: false, status: 403, error: "receipt was not issued" };
    }
    return { ok: true };
  }
  if (RECORD_METHODS.has(method)) {
    if (!record || !session.records.includes(record)) return { ok: false, status: 403, error: "not this session" };
    if (method === "create_share" && args.kind === "DeidApp") {
      const receipt = typeof args.tee_receipt_hash === "string" ? args.tee_receipt_hash.toLowerCase() : "";
      const artifact = typeof args.artifact_hash === "string" ? args.artifact_hash.toLowerCase() : "";
      if (!(await claimIssuedReceipt(session, receipt, artifact))) return { ok: false, status: 403, error: "receipt was not issued" };
    }
    return { ok: true };
  }
  if (method === "create_record") return { ok: true };
  return { ok: false, status: 403, error: "method not allowed" };
}

export async function claimIssuedReceipt(session: VisitorSession, receipt: string, artifact: string): Promise<boolean> {
  if (!HASH.test(receipt) || !HASH.test(artifact)) return false;
  const key = spendKey(session, receipt, artifact);
  if (spentReceipts.has(key)) return false;
  const index = session.issued.findIndex((item) => item.receipt === receipt && item.artifact === artifact);
  if (index < 0) return false;
  try {
    if (!(await sharedOnce().claim(key, "1", MAX_AGE_SECONDS))) return false;
  } catch {
    return false;
  }
  spentReceipts.add(key);
  session.issued.splice(index, 1);
  return true;
}

export async function releaseIssuedReceipt(session: VisitorSession, receipt: string, artifact: string): Promise<void> {
  const normalizedReceipt = receipt.toLowerCase();
  const normalizedArtifact = artifact.toLowerCase();
  if (!HASH.test(normalizedReceipt) || !HASH.test(normalizedArtifact)) return;
  const key = spendKey(session, normalizedReceipt, normalizedArtifact);
  spentReceipts.delete(key);
  try {
    await sharedOnce().release(key);
  } catch {
    spentReceipts.add(key);
    return;
  }
  if (!session.issued.some((item) => item.receipt === normalizedReceipt && item.artifact === normalizedArtifact)) {
    session.issued.push({ receipt: normalizedReceipt, artifact: normalizedArtifact });
    if (session.issued.length > ISSUED_CAP) session.issued.splice(0, session.issued.length - ISSUED_CAP);
  }
}

export function rememberStoryResult(session: VisitorSession, method: string, value: unknown): VisitorSession {
  const id = canonicalU64(typeof value === "string" || typeof value === "number" ? String(value) : "");
  if (!id) return session;
  if (method === "create_record") rememberId(session.records, id);
  if (method === "request_referral" || method === "create_share" || method === "submit_reply") rememberId(session.shares, id);
  return session;
}

function summaryKey(session: VisitorSession, shareId: string, receipt: string): string {
  return `summary:${domainTag()}:${session.sid}:${shareId}:${receipt}`;
}

function readSummaries(value: unknown, now: number): SummaryReceipt[] {
  if (!Array.isArray(value)) return [];
  const out: SummaryReceipt[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const shareId = (item as { shareId?: unknown }).shareId;
    const summaryHash = (item as { summaryHash?: unknown }).summaryHash;
    const receipt = (item as { receipt?: unknown }).receipt;
    const exp = (item as { exp?: unknown }).exp;
    const canonicalShare = canonicalU64(shareId);
    if (!canonicalShare) continue;
    if (typeof summaryHash !== "string" || typeof receipt !== "string" || typeof exp !== "number") continue;
    const normalizedHash = summaryHash.toLowerCase();
    const normalizedReceipt = receipt.toLowerCase();
    if (!HASH.test(normalizedHash) || normalizedReceipt !== normalizedHash || exp <= now) continue;
    out.push({ shareId: canonicalShare, summaryHash: normalizedHash, receipt: normalizedReceipt, exp });
  }
  return out.length > SUMMARY_CAP ? out.slice(out.length - SUMMARY_CAP) : out;
}

export function issueSummaryReceipt(
  session: VisitorSession,
  shareId: string,
  summaryHash: string,
  now = Date.now(),
): SummaryReceipt | null {
  if (!Array.isArray(session.summaries)) session.summaries = [];
  const canonical = canonicalU64(shareId);
  if (!canonical) return null;
  shareId = canonical;
  const hash = summaryHash.toLowerCase();
  if (!HASH.test(hash)) return null;
  const key = summaryKey(session, shareId, hash);
  if (spentSummaries.has(key)) return null;
  const existing = session.summaries.find((item) => item.shareId === shareId && item.receipt === hash && item.summaryHash === hash && item.exp > now);
  if (existing) return existing;
  session.summaries = session.summaries.filter((item) => item.exp > now);
  const issued: SummaryReceipt = { shareId, summaryHash: hash, receipt: hash, exp: now + SUMMARY_RECEIPT_TTL_MS };
  session.summaries.push(issued);
  if (session.summaries.length > SUMMARY_CAP) session.summaries.splice(0, session.summaries.length - SUMMARY_CAP);
  return session.summaries.find((item) => item.shareId === shareId && item.receipt === hash) ?? null;
}

export async function claimSummaryReceipt(session: VisitorSession, shareId: string, receipt: string, now = Date.now()): Promise<boolean> {
  if (!Array.isArray(session.summaries)) session.summaries = [];
  const canonical = canonicalU64(shareId);
  if (!canonical) return false;
  shareId = canonical;
  const normalized = receipt.toLowerCase();
  if (!HASH.test(normalized)) return false;
  const key = summaryKey(session, shareId, normalized);
  if (spentSummaries.has(key)) return false;
  const index = session.summaries.findIndex(
    (item) => item.shareId === shareId && item.receipt === normalized && item.summaryHash === normalized && item.exp > now,
  );
  if (index < 0) return false;
  try {
    if (!(await sharedOnce().claim(key, "1", MAX_AGE_SECONDS))) return false;
  } catch {
    return false;
  }
  const [item] = session.summaries.splice(index, 1);
  spentSummaries.add(key);
  claimedSummaries.set(key, item);
  return true;
}

export async function releaseSummaryReceipt(session: VisitorSession, shareId: string, receipt: string, now = Date.now()): Promise<void> {
  if (!Array.isArray(session.summaries)) session.summaries = [];
  const canonical = canonicalU64(shareId);
  if (!canonical) return;
  shareId = canonical;
  const normalized = receipt.toLowerCase();
  if (!HASH.test(normalized)) return;
  const key = summaryKey(session, shareId, normalized);
  const saved = claimedSummaries.get(key);
  if (!saved) return;
  claimedSummaries.delete(key);
  spentSummaries.delete(key);
  try {
    await sharedOnce().release(key);
  } catch {
    spentSummaries.add(key);
    claimedSummaries.set(key, saved);
    return;
  }
  if (saved.exp <= now) return;
  if (!session.summaries.some((item) => item.shareId === shareId && item.receipt === normalized)) {
    session.summaries.push(saved);
    if (session.summaries.length > SUMMARY_CAP) session.summaries.splice(0, session.summaries.length - SUMMARY_CAP);
  }
}

export function finishSummaryReceipt(session: VisitorSession, shareId: string, receipt: string): void {
  const canonical = canonicalU64(shareId);
  if (!canonical) return;
  shareId = canonical;
  const normalized = receipt.toLowerCase();
  if (!HASH.test(normalized)) return;
  claimedSummaries.delete(summaryKey(session, shareId, normalized));
}

function readAccount(value: unknown): string {
  if (typeof value !== "string" || !isAccountId(value)) return "";
  return value;
}

export function bindPatient(
  session: VisitorSession,
  accountId: string,
  mode: "local" | "wallet" | "demo",
  encPubkey: string,
  fundingTx = "",
): VisitorSession {
  session.patient = accountId;
  session.patientMode = mode;
  session.encPubkey = /^[0-9a-f]{64}$/.test(encPubkey) ? encPubkey : session.encPubkey;
  if (fundingTx) session.fundingTx = fundingTx;
  return session;
}

export function clearPatient(session: VisitorSession): VisitorSession {
  session.patient = "";
  session.patientMode = "";
  session.fundingTx = "";
  session.encPubkey = "";
  session.challengeNonce = "";
  session.challengeExp = 0;
  return session;
}

export function rememberChallenge(session: VisitorSession, nonce: string, exp: number): VisitorSession {
  session.challengeNonce = nonce;
  session.challengeExp = exp;
  return session;
}

export function rememberIssuedReceipt(session: VisitorSession, receipt: string, artifact: string): VisitorSession {
  const normalizedReceipt = receipt.toLowerCase();
  const normalizedArtifact = artifact.toLowerCase();
  if (!HASH.test(normalizedReceipt) || !HASH.test(normalizedArtifact)) return session;
  const existing = session.issued.findIndex((item) => item.receipt === normalizedReceipt && item.artifact === normalizedArtifact);
  if (existing >= 0) session.issued.splice(existing, 1);
  session.issued.push({ receipt: normalizedReceipt, artifact: normalizedArtifact });
  if (session.issued.length > ISSUED_CAP) session.issued.splice(0, session.issued.length - ISSUED_CAP);
  return session;
}
