import {
  ACCOUNTS,
  CLOCK,
  DEFAULT_PURPOSE,
  HASH,
  MAYA,
  ORG,
  PEOPLE,
  PHI_NEEDLES,
  SECTION_KEYS,
  SECTION_LABEL,
  TX,
  type ExpiryDays,
  type SectionKey,
} from "./fixtures";
import { readTeeEvidence, type TeeServerEvidence } from "./tee/evidence";
import { isServerSummaryHash } from "./tee/summary-hash";

export const STORAGE_KEY = "tendai-custody:v1";

export type ConsentStatus = "pending" | "active" | "declined";

export type OpenError = "ERR_REVOKED" | "ERR_DECLINED" | "ERR_NOT_ACTIVE" | "ERR_TAMPER";

export type ShareTarget = "referral" | "second" | "deid";

export interface Story {
  requestedSections: SectionKey[];
  includeCounseling: boolean;
  purpose: string;
  referralSent: boolean;
  referralTx: string | null;
  recordTx: string | null;
  grantedSections: SectionKey[];
  grantCounseling: boolean;
  expiryDays: ExpiryDays;
  readOnly: boolean;
  summaryReady: boolean;
  consentStatus: ConsentStatus;
  consentTx: string | null;
  declineTx: string | null;
  approvedAtMs: number | null;
  hospitalOpened: boolean;
  openCount: number;
  hospitalOpenTx: string | null;
  consultNote: string;
  consultSent: boolean;
  consultTx: string | null;
  lastOpenError: OpenError | null;
  blockedAttempt: boolean;
  secondExpiry: ExpiryDays;
  secondSent: boolean;
  secondTx: string | null;
  secondAtMs: number | null;
  secondOpened: boolean;
  secondReply: string;
  secondReplySent: boolean;
  secondReplyTx: string | null;
  leakScan: "idle" | "clean" | "hit";
  recordId: string | null;
  shareId: string | null;
  artifactHash: string | null;
  secondShareId: string | null;
  deidShareId: string | null;
  teeStatus: "idle" | "green" | "red";
  teeNote: string;
  teeReceipt: string;
  teeEvidence: TeeServerEvidence | null;
  summaryReceiptHash: string;
  summaryLatencyMs: number | null;
  tamper: boolean;
  summaryText: string;
  revokeTx: string | null;
  revokeAllTx: string | null;
  deidBefore: string;
  deidAfter: string;
  deidReceiptHash: string;
  deidArtifactHash: string;
  chainError: string | null;
  deidSent: boolean;
  deidTx: string | null;
  deidOpened: boolean;
  transferStub: boolean;
  revoked: Record<ShareTarget, boolean>;
  revokedAtLabel: string | null;
  demoActive: boolean;
  demoStep: number;
  proofSeen: boolean;
}

export type StoryAction =
  | { type: "reset" }
  | { type: "hydrate"; story: Story }
  | { type: "seed-maya" }
  | { type: "start-demo" }
  | { type: "set-demo-step"; step: number }
  | { type: "toggle-requested"; key: SectionKey }
  | { type: "toggle-include-counseling" }
  | { type: "set-purpose"; purpose: string }
  | { type: "send-referral" }
  | { type: "toggle-granted"; key: SectionKey }
  | { type: "toggle-grant-counseling" }
  | { type: "set-expiry"; days: ExpiryDays }
  | { type: "toggle-read-only" }
  | { type: "run-summary" }
  | { type: "approve" }
  | { type: "decline" }
  | { type: "open-hospital" }
  | { type: "send-consult"; note: string }
  | { type: "set-second-expiry"; days: ExpiryDays }
  | { type: "send-second" }
  | { type: "open-second" }
  | { type: "send-second-reply"; note: string }
  | { type: "run-leak" }
  | { type: "send-deid" }
  | { type: "open-deid" }
  | { type: "note-transfer" }
  | { type: "revoke"; target: ShareTarget }
  | { type: "revoke-all" }
  | { type: "blocked-attempt" }
  | { type: "mark-proof" }
  | { type: "chain-referral"; tx: string; recordTx: string; recordId: string; shareId: string }
  | { type: "chain-summary"; ok: boolean; note: string; text: string; receipt: string; receiptHash: string; latencyMs: number; evidence?: TeeServerEvidence | null }
  | { type: "toggle-tamper" }
  | { type: "tamper-blocked" }
  | { type: "chain-consult"; tx: string; note: string }
  | { type: "chain-second-reply"; tx: string; note: string }
  | { type: "chain-revoke"; target: ShareTarget; tx: string }
  | { type: "chain-decline"; tx: string }
  | { type: "chain-revoke-all"; tx: string }
  | { type: "chain-approve"; tx: string; artifactHash: string }
  | { type: "chain-open"; tx: string }
  | { type: "chain-second"; tx: string; shareId: string }
  | { type: "chain-deid"; tx: string; shareId: string }
  | { type: "chain-leak"; scan: "clean" | "hit"; before: string; after: string; receiptHash?: string; artifactHash?: string }
  | { type: "chain-error"; message: string };

export function freshStory(): Story {
  return {
    requestedSections: [...SECTION_KEYS],
    includeCounseling: false,
    purpose: DEFAULT_PURPOSE,
    referralSent: false,
    referralTx: null,
    recordTx: null,
    grantedSections: [...SECTION_KEYS],
    grantCounseling: false,
    expiryDays: 30,
    readOnly: true,
    summaryReady: false,
    consentStatus: "pending",
    consentTx: null,
    declineTx: null,
    approvedAtMs: null,
    hospitalOpened: false,
    openCount: 0,
    hospitalOpenTx: null,
    consultNote: "",
    consultSent: false,
    consultTx: null,
    lastOpenError: null,
    blockedAttempt: false,
    secondExpiry: 7,
    secondSent: false,
    secondTx: null,
    secondAtMs: null,
    secondOpened: false,
    secondReply: "",
    secondReplySent: false,
    secondReplyTx: null,
    leakScan: "idle",
    recordId: null,
    shareId: null,
    artifactHash: null,
    secondShareId: null,
    deidShareId: null,
    teeStatus: "idle",
    teeNote: "",
    teeReceipt: "",
    teeEvidence: null,
    summaryReceiptHash: "",
    summaryLatencyMs: null,
    tamper: false,
    summaryText: "",
    revokeTx: null,
    revokeAllTx: null,
    deidBefore: "",
    deidAfter: "",
    deidReceiptHash: "",
    deidArtifactHash: "",
    chainError: null,
    deidSent: false,
    deidTx: null,
    deidOpened: false,
    transferStub: false,
    revoked: { referral: false, second: false, deid: false },
    revokedAtLabel: null,
    demoActive: false,
    demoStep: 0,
    proofSeen: false,
  };
}

function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === "string" && (SECTION_KEYS as readonly string[]).includes(value);
}

function asSections(value: unknown, fallback: SectionKey[]): SectionKey[] {
  if (!Array.isArray(value)) return fallback;
  const keys = value.filter(isSectionKey);
  return keys.length > 0 || value.length === 0 ? keys : fallback;
}

function asExpiry(value: unknown, fallback: ExpiryDays): ExpiryDays {
  return value === 7 || value === 30 || value === 90 ? value : fallback;
}

function asStatus(value: unknown): ConsentStatus {
  return value === "active" || value === "declined" || value === "pending" ? value : "pending";
}

function bit(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export function normalizeStory(input: unknown): Story {
  const base = freshStory();
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<Story>;
  const revoked = raw.revoked;
  const openError = raw.lastOpenError;
  const step = raw.demoStep;
  return {
    requestedSections: asSections(raw.requestedSections, base.requestedSections),
    includeCounseling: bit(raw.includeCounseling, base.includeCounseling),
    purpose: text(raw.purpose, base.purpose),
    referralSent: bit(raw.referralSent, false),
    referralTx: raw.referralTx === null || typeof raw.referralTx === "string" ? raw.referralTx ?? null : null,
    recordTx: raw.recordTx === null || typeof raw.recordTx === "string" ? raw.recordTx ?? null : null,
    grantedSections: asSections(raw.grantedSections, base.grantedSections),
    grantCounseling: bit(raw.grantCounseling, base.grantCounseling),
    expiryDays: asExpiry(raw.expiryDays, 30),
    readOnly: bit(raw.readOnly, true),
    summaryReady: bit(raw.summaryReady, false),
    consentStatus: asStatus(raw.consentStatus),
    consentTx: raw.consentTx === null || typeof raw.consentTx === "string" ? raw.consentTx ?? null : null,
    declineTx: raw.declineTx === null || typeof raw.declineTx === "string" ? raw.declineTx ?? null : null,
    approvedAtMs: typeof raw.approvedAtMs === "number" && raw.approvedAtMs > 0 ? raw.approvedAtMs : null,
    hospitalOpened: bit(raw.hospitalOpened, false),
    openCount: typeof raw.openCount === "number" && raw.openCount >= 0 ? Math.floor(raw.openCount) : 0,
    hospitalOpenTx:
      raw.hospitalOpenTx === null || typeof raw.hospitalOpenTx === "string" ? raw.hospitalOpenTx ?? null : null,
    consultNote: text(raw.consultNote, ""),
    consultSent: bit(raw.consultSent, false),
    consultTx: raw.consultTx === null || typeof raw.consultTx === "string" ? raw.consultTx ?? null : null,
    lastOpenError:
      openError === "ERR_REVOKED" || openError === "ERR_DECLINED" || openError === "ERR_NOT_ACTIVE" || openError === "ERR_TAMPER"
        ? openError
        : null,
    blockedAttempt: bit(raw.blockedAttempt, false),
    secondExpiry: asExpiry(raw.secondExpiry, 7),
    secondSent: bit(raw.secondSent, false),
    secondTx: raw.secondTx === null || typeof raw.secondTx === "string" ? raw.secondTx ?? null : null,
    secondAtMs: typeof raw.secondAtMs === "number" && raw.secondAtMs > 0 ? raw.secondAtMs : null,
    secondOpened: bit(raw.secondOpened, false),
    secondReply: text(raw.secondReply, ""),
    secondReplySent: bit(raw.secondReplySent, false),
    secondReplyTx: raw.secondReplyTx === null || typeof raw.secondReplyTx === "string" ? raw.secondReplyTx ?? null : null,
    leakScan: raw.leakScan === "clean" || raw.leakScan === "hit" ? raw.leakScan : "idle",
    recordId: raw.recordId === null || typeof raw.recordId === "string" ? raw.recordId ?? null : null,
    shareId: raw.shareId === null || typeof raw.shareId === "string" ? raw.shareId ?? null : null,
    artifactHash: raw.artifactHash === null || typeof raw.artifactHash === "string" ? raw.artifactHash ?? null : null,
    secondShareId: raw.secondShareId === null || typeof raw.secondShareId === "string" ? raw.secondShareId ?? null : null,
    deidShareId: raw.deidShareId === null || typeof raw.deidShareId === "string" ? raw.deidShareId ?? null : null,
    teeStatus: raw.teeStatus === "green" || raw.teeStatus === "red" ? raw.teeStatus : "idle",
    teeNote: text(raw.teeNote, ""),
    teeReceipt: text(raw.teeReceipt, ""),
    teeEvidence: readTeeEvidence(raw.teeEvidence),
    summaryReceiptHash: isServerSummaryHash(text(raw.summaryReceiptHash, "")) ? text(raw.summaryReceiptHash, "") : "",
    summaryLatencyMs: typeof raw.summaryLatencyMs === "number" && raw.summaryLatencyMs >= 0 ? raw.summaryLatencyMs : null,
    tamper: bit(raw.tamper, false),
    summaryText: text(raw.summaryText, ""),
    revokeTx: raw.revokeTx === null || typeof raw.revokeTx === "string" ? raw.revokeTx ?? null : null,
    revokeAllTx: raw.revokeAllTx === null || typeof raw.revokeAllTx === "string" ? raw.revokeAllTx ?? null : null,
    deidBefore: text(raw.deidBefore, ""),
    deidAfter: text(raw.deidAfter, ""),
    deidReceiptHash: text(raw.deidReceiptHash, ""),
    deidArtifactHash: text(raw.deidArtifactHash, ""),
    chainError: raw.chainError === null || typeof raw.chainError === "string" ? raw.chainError ?? null : null,
    deidSent: bit(raw.deidSent, false),
    deidTx: raw.deidTx === null || typeof raw.deidTx === "string" ? raw.deidTx ?? null : null,
    deidOpened: bit(raw.deidOpened, false),
    transferStub: bit(raw.transferStub, false),
    revoked: {
      referral: bit(revoked?.referral, false),
      second: bit(revoked?.second, false),
      deid: bit(revoked?.deid, false),
    },
    revokedAtLabel: raw.revokedAtLabel === null || typeof raw.revokedAtLabel === "string" ? raw.revokedAtLabel ?? null : null,
    demoActive: bit(raw.demoActive, false),
    demoStep: typeof step === "number" && step >= 0 && step <= 6 ? Math.floor(step) : 0,
    proofSeen: bit(raw.proofSeen, false),
  };
}

function toggleKey(list: SectionKey[], key: SectionKey): SectionKey[] {
  return list.includes(key) ? list.filter((item) => item !== key) : [...list, key];
}

export function bangkokClock(date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function withRevoke(state: Story, target: ShareTarget): Story {
  return {
    ...state,
    revoked: { ...state.revoked, [target]: true },
    revokedAtLabel: bangkokClock(),
  };
}

export function storyReducer(state: Story, action: StoryAction): Story {
  switch (action.type) {
    case "reset":
      return freshStory();
    case "hydrate":
      return normalizeStory(action.story);
    case "seed-maya":
      return {
        ...freshStory(),
        referralSent: true,
        referralTx: TX.referral,
        summaryReady: true,
        expiryDays: 30,
        readOnly: true,
      };
    case "start-demo":
      return { ...freshStory(), demoActive: true, demoStep: 0 };
    case "set-demo-step":
      return { ...state, demoStep: Math.max(0, Math.min(6, action.step)) };
    case "toggle-requested":
      if (state.referralSent) return state;
      return { ...state, requestedSections: toggleKey(state.requestedSections, action.key) };
    case "toggle-include-counseling":
      if (state.referralSent) return state;
      return { ...state, includeCounseling: !state.includeCounseling };
    case "set-purpose":
      if (state.referralSent) return state;
      return { ...state, purpose: action.purpose };
    case "send-referral":
      if (state.referralSent || state.requestedSections.length === 0 || state.purpose.trim() === "") return state;
      return {
        ...state,
        referralSent: true,
        referralTx: TX.referral,
        grantedSections: [...state.requestedSections],
        grantCounseling: state.includeCounseling && state.requestedSections.includes("notes"),
        consentStatus: "pending",
      };
    case "toggle-granted":
      if (referralStatus(state) !== "pending") return state;
      return { ...state, grantedSections: toggleKey(state.grantedSections, action.key) };
    case "toggle-grant-counseling":
      if (referralStatus(state) !== "pending") return state;
      return { ...state, grantCounseling: !state.grantCounseling };
    case "set-expiry":
      if (referralStatus(state) !== "pending") return state;
      return { ...state, expiryDays: action.days };
    case "toggle-read-only":
      if (referralStatus(state) !== "pending") return state;
      return { ...state, readOnly: !state.readOnly };
    case "run-summary":
      if (!state.referralSent || state.revoked.referral || state.consentStatus === "declined") return state;
      return { ...state, summaryReady: true };
    case "chain-referral":
      return {
        ...state,
        referralSent: true,
        referralTx: action.tx,
        recordTx: action.recordTx,
        recordId: action.recordId,
        shareId: action.shareId,
        grantedSections: [...state.requestedSections],
        grantCounseling: state.includeCounseling && state.requestedSections.includes("notes"),
        consentStatus: "pending",
        chainError: null,
      };
    case "chain-summary": {
      const usable = action.ok && isServerSummaryHash(action.receiptHash);
      return {
        ...state,
        summaryReady: usable,
        teeStatus: usable ? "green" : "red",
        teeNote: action.note,
        teeReceipt: action.receipt,
        teeEvidence: usable ? readTeeEvidence(action.evidence) : null,
        summaryReceiptHash: usable ? action.receiptHash : "",
        summaryLatencyMs: action.latencyMs > 0 ? action.latencyMs : state.summaryLatencyMs,
        summaryText: action.text,
        chainError: usable ? null : action.note,
      };
    }
    case "toggle-tamper":
      return { ...state, tamper: !state.tamper, lastOpenError: null, chainError: null };
    case "tamper-blocked":
      return { ...state, lastOpenError: "ERR_TAMPER", chainError: null };
    case "chain-consult":
      return { ...state, consultSent: true, consultNote: action.note, consultTx: action.tx, chainError: null };
    case "chain-second-reply":
      return { ...state, secondReplySent: true, secondReply: action.note, secondReplyTx: action.tx, chainError: null };
    case "chain-revoke":
      return { ...withRevoke(state, action.target), revokeTx: action.tx, chainError: null };
    case "chain-decline":
      if (referralStatus(state) !== "pending") return state;
      return { ...state, consentStatus: "declined", declineTx: action.tx, chainError: null };
    case "chain-revoke-all": {
      const cleared = storyReducer(state, { type: "revoke-all" });
      return { ...cleared, revokeAllTx: action.tx, revokeTx: action.tx, chainError: null };
    }
    case "chain-approve":
      return { ...state, consentStatus: "active", consentTx: action.tx, approvedAtMs: Date.now(), artifactHash: action.artifactHash, chainError: null };
    case "chain-open":
      return {
        ...state,
        hospitalOpened: true,
        openCount: state.openCount + 1,
        hospitalOpenTx: action.tx,
        lastOpenError: null,
        chainError: null,
      };
    case "chain-second":
      return { ...state, secondSent: true, secondTx: action.tx, secondAtMs: Date.now(), secondShareId: action.shareId, chainError: null };
    case "chain-deid":
      return { ...state, deidSent: true, deidTx: action.tx, deidShareId: action.shareId, chainError: null };
    case "chain-leak":
      return {
        ...state,
        leakScan: action.scan,
        deidBefore: action.before,
        deidAfter: action.after,
        deidReceiptHash: action.receiptHash ?? "",
        deidArtifactHash: action.artifactHash ?? "",
        chainError: action.scan === "clean" ? null : state.chainError,
      };
    case "chain-error":
      return { ...state, chainError: action.message };
    case "approve":
      if (approveBlock(state)) return state;
      return { ...state, consentStatus: "active", consentTx: TX.approve, approvedAtMs: Date.now() };
    case "decline":
      if (referralStatus(state) !== "pending") return state;
      return { ...state, consentStatus: "declined" };
    case "open-hospital": {
      const failure = hospitalOpenFailure(state);
      if (failure) {
        return {
          ...state,
          lastOpenError: failure,
          blockedAttempt: failure === "ERR_REVOKED" ? true : state.blockedAttempt,
          chainError: null,
        };
      }
      return {
        ...state,
        hospitalOpened: true,
        openCount: state.openCount + 1,
        hospitalOpenTx: TX.open,
        lastOpenError: null,
      };
    }
    case "send-consult": {
      const note = action.note.trim();
      if (!state.hospitalOpened || state.revoked.referral || state.consultSent || note === "") return state;
      return { ...state, consultNote: note, consultSent: true, consultTx: TX.reply };
    }
    case "set-second-expiry":
      if (state.secondSent) return state;
      return { ...state, secondExpiry: action.days };
    case "send-second":
      if (state.secondSent || state.consentStatus !== "active") return state;
      return { ...state, secondSent: true, secondTx: TX.second, secondAtMs: Date.now() };
    case "open-second":
      if (!state.secondSent || state.revoked.second) return state;
      return { ...state, secondOpened: true };
    case "send-second-reply": {
      const note = action.note.trim();
      if (!state.secondOpened || state.revoked.second || state.secondReplySent || note === "") return state;
      return { ...state, secondReply: note, secondReplySent: true };
    }
    case "run-leak":
      return { ...state, leakScan: "clean" };
    case "send-deid":
      if (state.deidSent || state.leakScan !== "clean") return state;
      return { ...state, deidSent: true, deidTx: TX.deid };
    case "open-deid":
      if (!state.deidSent || state.revoked.deid) return state;
      return { ...state, deidOpened: true, chainError: null };
    case "note-transfer":
      return { ...state, transferStub: true };
    case "revoke":
      if (action.target === "referral" && !state.referralSent) return state;
      if (action.target === "second" && !state.secondSent) return state;
      if (action.target === "deid" && !state.deidSent) return state;
      if (state.revoked[action.target]) return state;
      if (action.target === "referral" && state.consentStatus === "declined") return state;
      return withRevoke(state, action.target);
    case "revoke-all": {
      let next = state;
      if (state.referralSent && state.consentStatus !== "declined" && !state.revoked.referral) {
        next = withRevoke(next, "referral");
      }
      if (state.secondSent && !state.revoked.second) next = withRevoke(next, "second");
      if (state.deidSent && !state.revoked.deid) next = withRevoke(next, "deid");
      return next;
    }
    case "blocked-attempt":
      if (state.blockedAttempt) return state;
      return {
        ...state,
        blockedAttempt: true,
        lastOpenError: state.revoked.referral ? "ERR_REVOKED" : state.lastOpenError,
      };
    case "mark-proof":
      if (state.proofSeen) return state;
      return { ...state, proofSeen: true };
    default:
      return state;
  }
}

export function referralStatus(state: Story): "unsent" | ConsentStatus | "revoked" {
  if (!state.referralSent) return "unsent";
  if (state.revoked.referral) return "revoked";
  return state.consentStatus;
}

export function hospitalOpenFailure(state: Story): OpenError | null {
  const status = referralStatus(state);
  if (status === "unsent") return null;
  if (status === "revoked") return "ERR_REVOKED";
  if (status === "declined") return "ERR_DECLINED";
  if (status === "pending") return "ERR_NOT_ACTIVE";
  return null;
}

export function approveBlock(state: Story): string | null {
  const status = referralStatus(state);
  if (status === "unsent") return "No referral yet.";
  if (status === "revoked") return "This share is already revoked.";
  if (status === "declined") return "Maya declined this request.";
  if (status === "active") return null;
  if (state.tamper) return "Tamper is on. Approve stays blocked.";
  if (!state.summaryReady) return "Run the summary first.";
  if (state.teeStatus !== "green") return "Verified panel is not green. Approve stays blocked.";
  if (state.grantedSections.length === 0) return "Grant at least one section.";
  return null;
}

export function counselingGranted(state: Story): boolean {
  return state.grantCounseling && state.grantedSections.includes("notes");
}

export function expiryDate(days: ExpiryDays): string {
  if (days === 7) return "2026-11-19";
  if (days === 30) return "2026-12-12";
  return "2027-02-10";
}

export function sectionList(keys: SectionKey[]): string {
  return keys.map((key) => SECTION_LABEL[key]).join(", ");
}

export function summaryParagraph(state: Story): string {
  const live = state.summaryText.trim();
  if (live) return live;
  const bits: string[] = [];
  if (state.grantedSections.includes("history")) {
    bits.push(
      `${MAYA.age} year old. Hypertension for 6 years. Chest tightness on stairs for 3 weeks, resolves with rest. Father MI at 61. Ex-smoker. BP 152/94, HR 78, BMI 29.`,
    );
  }
  if (state.grantedSections.includes("meds")) {
    bits.push("Lisinopril 20 mg daily. Atorvastatin 20 mg daily.");
  }
  if (state.grantedSections.includes("labs")) {
    bits.push("Labs: LDL 168 mg/dL, HDL 41, A1c 5.9%, creatinine 0.9, TSH normal.");
  }
  if (state.grantedSections.includes("imaging")) {
    bits.push("Resting ECG nonspecific ST changes. Chest X-ray normal.");
  }
  if (state.grantedSections.includes("notes")) {
    bits.push("Request: stress testing and a cardiology evaluation.");
    if (counselingGranted(state)) {
      bits.push(
        "Warning: a 2021 counseling visit for anxiety is still included. Untick it if cardiology does not need it.",
      );
    } else {
      bits.push("The 2021 counseling visit is left out.");
    }
  } else {
    bits.push("Notes are not included. The counseling visit is left out.");
  }
  if (bits.length === 0) return "No sections selected. There is nothing to summarize.";
  return bits.join(" ");
}

export interface PatientEvent {
  id: string;
  at: string;
  title: string;
  detail: string;
  kind: string;
}

export interface CopyRow {
  id: string;
  holder: string;
  kind: string;
  scope: string;
  expiry: string;
  opens: string;
  status: string;
  target: ShareTarget;
  canRevoke: boolean;
}

export function patientEvents(state: Story): PatientEvent[] {
  const events: PatientEvent[] = [
    {
      id: "record",
      at: CLOCK.record,
      title: "Chart created",
      detail: `${ORG.clinic} holds Maya's chart, and NEAR stores section hashes only.`,
      kind: "record_created",
    },
  ];
  if (state.referralSent) {
    events.push({
      id: "requested",
      at: CLOCK.referral,
      title: "Referral requested",
      detail: `${PEOPLE.lena} asked ${ORG.hospital} to review the chart.`,
      kind: "referral_requested",
    });
  }
  if (state.consentStatus === "declined") {
    events.push({
      id: "declined",
      at: CLOCK.consent,
      title: "Maya declined",
      detail: "The share stays closed.",
      kind: "share_declined",
    });
  }
  if (state.consentStatus === "active") {
    events.push({
      id: "consented",
      at: CLOCK.consent,
      title: "Maya approved",
      detail: `${sectionList(state.grantedSections)}. ${state.expiryDays} days. ${state.readOnly ? "Read only." : "Not read only."} ${counselingGranted(state) ? "Counseling included." : "Counseling excluded."}`,
      kind: "share_consented",
    });
    events.push({
      id: "transformed",
      at: CLOCK.consent,
      title: "Summary prepared",
      detail:
        state.teeStatus === "green"
          ? "Minimum-necessary summary inside the model TEE. This phone re-wraps the data key for the hospital."
          : "This phone re-wraps the data key for the hospital.",
      kind: "share_transformed",
    });
  }
  if (state.hospitalOpened) {
    events.push({
      id: "opened",
      at: CLOCK.open,
      title: "Hospital opened the share",
      detail: `${ORG.hospital}. Opens: ${state.openCount}.`,
      kind: "share_opened",
    });
  }
  if (state.consultSent) {
    events.push({
      id: "reply",
      at: CLOCK.reply,
      title: "Consult note to Maya",
      detail: "Riverbend does not see this unless Maya forwards it.",
      kind: "reply_submitted",
    });
  }
  if (state.secondSent) {
    events.push({
      id: "second",
      at: CLOCK.second,
      title: "Second opinion created",
      detail: `${ORG.second}. Read only. ${state.secondExpiry} days.`,
      kind: "share_created",
    });
  }
  if (state.secondOpened) {
    events.push({
      id: "second-open",
      at: CLOCK.second,
      title: "Second opinion opened",
      detail: PEOPLE.sofia,
      kind: "share_opened",
    });
  }
  if (state.secondReplySent) {
    events.push({
      id: "second-reply",
      at: CLOCK.second,
      title: "Reply from Dr. Reyes",
      detail: "Comes back to Maya only.",
      kind: "reply_submitted",
    });
  }
  if (state.deidSent) {
    events.push({
      id: "deid",
      at: CLOCK.deid,
      title: "De-identified copy created",
      detail: `${ORG.app}. Best effort, with a preview.`,
      kind: "share_created",
    });
  }
  if (state.deidOpened) {
    events.push({
      id: "deid-open",
      at: CLOCK.deid,
      title: "PulseFit opened the stripped copy",
      detail: "No name, MRN, address, phone, or calendar date on that screen.",
      kind: "share_opened",
    });
  }
  if (state.revoked.referral) {
    events.push({
      id: "revoke-referral",
      at: CLOCK.revoke,
      title: "Revoked St. Aster",
      detail: "Future opens through TendAI Custody fail.",
      kind: "share_revoked",
    });
  }
  if (state.revoked.second) {
    events.push({
      id: "revoke-second",
      at: CLOCK.revoke,
      title: "Revoked Northgate Heart Institute",
      detail: "The second opinion share is closed.",
      kind: "share_revoked",
    });
  }
  if (state.revoked.deid) {
    events.push({
      id: "revoke-deid",
      at: CLOCK.revoke,
      title: "Revoked PulseFit",
      detail: "The app cannot fetch the copy again through TendAI Custody.",
      kind: "share_revoked",
    });
  }
  return events;
}

export interface HistoryItem {
  id: string;
  at: string;
  title: string;
  actor: string;
  person: string;
  record: string;
  sections: string;
  method: string;
  tx: string | null;
}

export function historyFeed(state: Story): HistoryItem[] {
  const items: HistoryItem[] = [
    {
      id: "created",
      at: "2026-11-12 09:14 (Bangkok)",
      title: "Chart created",
      actor: PEOPLE.lena,
      person: PEOPLE.lena,
      record: "Riverbend chart",
      sections: sectionList([...SECTION_KEYS]),
      method: "Source record",
      tx: null,
    },
  ];
  if (state.referralSent) {
    items.push({
      id: "sent",
      at: "2026-11-12 09:16 (Bangkok)",
      title: "Referral sent",
      actor: PEOPLE.lena,
      person: PEOPLE.lena,
      record: "Riverbend chart",
      sections: sectionList(state.requestedSections),
      method: "Referral",
      tx: state.referralTx,
    });
  }
  if (state.consentStatus === "active") {
    items.push({
      id: "approved",
      at: "2026-11-12 09:22 (Bangkok)",
      title: "Maya approved",
      actor: PEOPLE.maya,
      person: PEOPLE.maya,
      record: "Riverbend chart",
      sections: sectionList(state.grantedSections),
      method: "Referral",
      tx: state.consentTx,
    });
  }
  if (state.consentStatus === "declined") {
    items.push({
      id: "denied",
      at: "2026-11-12 09:22 (Bangkok)",
      title: "Maya denied",
      actor: PEOPLE.maya,
      person: PEOPLE.maya,
      record: "Riverbend chart",
      sections: sectionList(state.grantedSections),
      method: "Referral",
      tx: null,
    });
  }
  if (state.hospitalOpened) {
    items.push({
      id: "opened",
      at: "2026-11-12 10:42 (Bangkok)",
      title: "Opened by Dr. Mehta",
      actor: PEOPLE.arjun,
      person: PEOPLE.arjun,
      record: "Riverbend chart",
      sections: sectionList(state.grantedSections),
      method: "Referral",
      tx: state.hospitalOpenTx,
    });
  }
  if (state.consultSent) {
    items.push({
      id: "consult",
      at: "2026-11-12 10:48 (Bangkok)",
      title: "Consult note sent to Maya",
      actor: PEOPLE.arjun,
      person: PEOPLE.arjun,
      record: "St. Aster consult",
      sections: "Consult note",
      method: "Reply",
      tx: state.consultTx,
    });
  }
  if (state.secondSent) {
    items.push({
      id: "second",
      at: "2026-11-12 11:05 (Bangkok)",
      title: "Second opinion sent",
      actor: PEOPLE.maya,
      person: PEOPLE.sofia,
      record: "Riverbend chart",
      sections: "Summary",
      method: "Second opinion",
      tx: state.secondTx,
    });
  }
  if (state.deidSent) {
    items.push({
      id: "deid",
      at: "2026-11-12 11:20 (Bangkok)",
      title: "De-identified copy sent to PulseFit",
      actor: PEOPLE.maya,
      person: "PulseFit",
      record: "PulseFit copy",
      sections: "Stripped copy",
      method: "De-identified app copy",
      tx: state.deidTx,
    });
  }
  if (state.revoked.referral) {
    items.push({
      id: "revoked",
      at: "2026-11-12 14:32 (Bangkok)",
      title: "Revoked St. Aster",
      actor: PEOPLE.maya,
      person: PEOPLE.maya,
      record: "Riverbend chart",
      sections: sectionList(state.grantedSections),
      method: "Revoke",
      tx: state.revokeTx,
    });
  }
  if (state.blockedAttempt) {
    items.push({
      id: "blocked",
      at: "2026-11-12 14:33 (Bangkok)",
      title: "Blocked open",
      actor: PEOPLE.arjun,
      person: PEOPLE.arjun,
      record: "Riverbend chart",
      sections: "None. ERR_REVOKED",
      method: "Referral",
      tx: null,
    });
  }
  return items;
}

export function copyRows(state: Story): CopyRow[] {
  const rows: CopyRow[] = [];
  if (state.referralSent) {
    const status = referralStatus(state);
    rows.push({
      id: state.shareId ?? "pending",
      holder: `${ORG.hospital} (${PEOPLE.arjun})`,
      kind: "Referral",
      scope: `${sectionList(state.grantedSections)}${counselingGranted(state) ? ". Counseling included" : ". Counseling excluded"}${state.readOnly ? ". Read only" : ""}`,
      expiry: status === "pending" ? "Set on approve" : `${state.expiryDays} days, through ${expiryDate(state.expiryDays)}`,
      opens: String(state.openCount),
      status: status === "unsent" ? "Requested" : status[0].toUpperCase() + status.slice(1),
      target: "referral",
      canRevoke: status === "pending" || status === "active",
    });
  }
  if (state.secondSent) {
    rows.push({
      id: state.secondShareId ?? "pending",
      holder: `${ORG.second} (${PEOPLE.sofia})`,
      kind: "Second opinion",
      scope: "Summary. Read only",
      expiry: `${state.secondExpiry} days, through ${expiryDate(state.secondExpiry)}`,
      opens: state.secondOpened ? "1" : "0",
      status: state.revoked.second ? "Revoked" : "Active",
      target: "second",
      canRevoke: !state.revoked.second,
    });
  }
  if (state.deidSent) {
    rows.push({
      id: state.deidShareId ?? "pending",
      holder: ORG.app,
      kind: "De-identified app",
      scope: "Stripped copy. Best effort",
      expiry: "No expiry",
      opens: state.deidOpened ? "1" : "0",
      status: state.revoked.deid ? "Revoked" : "Active",
      target: "deid",
      canRevoke: !state.revoked.deid,
    });
  }
  return rows;
}

export interface ChainEvent {
  at: string;
  actor: string;
  kind: string;
  share_id: string | null;
  detail_hash: string | null;
}

export interface ChainView {
  standard: "referral_relay";
  version: "1.0.0";
  network: "testnet";
  contract: string;
  stub: true;
  record: {
    id: string;
    patient: string;
    created_by: string;
    created_at: string;
    sections: { key: SectionKey; cipher_hash: string }[];
  };
  shares: Record<string, unknown>[];
  events: ChainEvent[];
}

export function chainView(state: Story): ChainView {
  const events: ChainEvent[] = [
    {
      at: CLOCK.record,
      actor: ACCOUNTS.clinic,
      kind: "record_created",
      share_id: null,
      detail_hash: HASH.history,
    },
  ];
  const shares: Record<string, unknown>[] = [];
  if (state.referralSent) {
    const status = referralStatus(state);
    shares.push({
      id: "s-40",
      record_id: "r-12",
      parent: null,
      kind: "Referral",
      initiator: ACCOUNTS.clinic,
      to: ACCOUNTS.hospital,
      requested_sections: state.requestedSections,
      granted_sections: state.consentStatus === "active" ? state.grantedSections : [],
      purpose_hash: HASH.purpose,
      artifact_hash: state.consentStatus === "active" ? HASH.artifact : null,
      tee_receipt_hash: state.consentStatus === "active" ? HASH.tee : null,
      read_only: state.readOnly,
      expires_at: state.consentStatus === "active" ? expiryDate(state.expiryDays) : null,
      effective_status: status === "pending" ? "Requested" : status === "active" ? "Active" : status === "declined" ? "Declined" : "Revoked",
      open_count: state.openCount,
    });
    events.push({
      at: CLOCK.referral,
      actor: ACCOUNTS.clinic,
      kind: "referral_requested",
      share_id: "s-40",
      detail_hash: HASH.purpose,
    });
  }
  if (state.consentStatus === "active") {
    events.push(
      {
        at: CLOCK.consent,
        actor: ACCOUNTS.patient,
        kind: "share_consented",
        share_id: "s-40",
        detail_hash: HASH.artifact,
      },
      {
        at: CLOCK.consent,
        actor: ACCOUNTS.patient,
        kind: "share_transformed",
        share_id: "s-40",
        detail_hash: HASH.tee,
      },
    );
  }
  if (state.consentStatus === "declined") {
    events.push({
      at: CLOCK.consent,
      actor: ACCOUNTS.patient,
      kind: "share_declined",
      share_id: "s-40",
      detail_hash: null,
    });
  }
  if (state.hospitalOpened) {
    events.push({
      at: CLOCK.open,
      actor: ACCOUNTS.hospital,
      kind: "share_opened",
      share_id: "s-40",
      detail_hash: HASH.nonce,
    });
  }
  if (state.consultSent) {
    shares.push({
      id: "s-41",
      record_id: "r-12",
      parent: "s-40",
      kind: "Reply",
      initiator: ACCOUNTS.hospital,
      to: ACCOUNTS.patient,
      purpose_hash: HASH.reply,
      artifact_hash: HASH.reply,
      effective_status: "Active",
    });
    events.push({
      at: CLOCK.reply,
      actor: ACCOUNTS.hospital,
      kind: "reply_submitted",
      share_id: "s-41",
      detail_hash: HASH.reply,
    });
  }
  if (state.secondSent) {
    shares.push({
      id: "s-42",
      record_id: "r-12",
      parent: "s-40",
      kind: "SecondOpinion",
      initiator: ACCOUNTS.patient,
      to: ACCOUNTS.second,
      read_only: true,
      expires_at: expiryDate(state.secondExpiry),
      artifact_hash: HASH.second,
      effective_status: state.revoked.second ? "Revoked" : "Active",
      open_count: state.secondOpened ? 1 : 0,
    });
    events.push({
      at: CLOCK.second,
      actor: ACCOUNTS.patient,
      kind: "share_created",
      share_id: "s-42",
      detail_hash: HASH.second,
    });
  }
  if (state.secondReplySent) {
    events.push({
      at: CLOCK.second,
      actor: ACCOUNTS.second,
      kind: "reply_submitted",
      share_id: "s-42",
      detail_hash: HASH.second,
    });
  }
  if (state.deidSent) {
    shares.push({
      id: "s-43",
      record_id: "r-12",
      parent: null,
      kind: "DeidApp",
      initiator: ACCOUNTS.patient,
      to: ACCOUNTS.app,
      artifact_hash: HASH.deid,
      effective_status: state.revoked.deid ? "Revoked" : "Active",
      open_count: state.deidOpened ? 1 : 0,
    });
    events.push({
      at: CLOCK.deid,
      actor: ACCOUNTS.patient,
      kind: "share_created",
      share_id: "s-43",
      detail_hash: HASH.deid,
    });
  }
  if (state.revoked.referral) {
    events.push({
      at: CLOCK.revoke,
      actor: ACCOUNTS.patient,
      kind: "share_revoked",
      share_id: "s-40",
      detail_hash: null,
    });
  }
  if (state.revoked.second) {
    events.push({
      at: CLOCK.revoke,
      actor: ACCOUNTS.patient,
      kind: "share_revoked",
      share_id: "s-42",
      detail_hash: null,
    });
  }
  if (state.revoked.deid) {
    events.push({
      at: CLOCK.revoke,
      actor: ACCOUNTS.patient,
      kind: "share_revoked",
      share_id: "s-43",
      detail_hash: null,
    });
  }
  return {
    standard: "referral_relay",
    version: "1.0.0",
    network: "testnet",
    contract: ACCOUNTS.contract,
    stub: true,
    record: {
      id: "r-12",
      patient: ACCOUNTS.patient,
      created_by: ACCOUNTS.clinic,
      created_at: CLOCK.record,
      sections: SECTION_KEYS.map((key) => ({ key, cipher_hash: HASH[key] })),
    },
    shares,
    events,
  };
}

export function phiHits(value: unknown): string[] {
  const blob = JSON.stringify(value).toLowerCase();
  return PHI_NEEDLES.filter((needle) => blob.includes(needle.toLowerCase()));
}

export function loadStory(): Story | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeStory(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStory(state: Story): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or a full quota. The in-memory story still works.
  }
}
