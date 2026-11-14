import { canonicalU64 } from "../ids.ts";

// Argument shapes for POST /api/sign.
// The methods and keys are the ones web/lib/relay/flow.ts sends.
// Unknown keys are rejected. Account ids in arguments must match the
// configured demo accounts. The signer key is chosen from the role, later.

export const SIGN_METHODS = [
  "create_record",
  "request_referral",
  "approve_share",
  "decline_share",
  "create_share",
  "request_open",
  "submit_reply",
  "revoke_share",
  "revoke_all_for_record",
] as const;

export type SignMethod = (typeof SIGN_METHODS)[number];

export const SIGN_ROLES = ["clinic", "hospital", "second", "app", "patient"] as const;

export type SignRole = (typeof SIGN_ROLES)[number];

export const METHOD_ROLES: Record<SignMethod, readonly SignRole[]> = {
  create_record: ["clinic"],
  request_referral: ["clinic"],
  approve_share: ["patient"],
  decline_share: ["patient"],
  create_share: ["patient"],
  request_open: ["hospital", "second", "app"],
  submit_reply: ["hospital", "second"],
  revoke_share: ["patient"],
  revoke_all_for_record: ["patient"],
};

export type SignParseOptions = {
  allowPatientRole: boolean;
  patientAccount: string | null;
};

export type SignAccounts = {
  clinic: string;
  patient: string;
  hospital: string;
  second: string;
  app: string;
};

export type ParsedSign =
  | { ok: true; role: SignRole; method: SignMethod; args: Record<string, unknown> }
  | { ok: false; status: 400 | 403 | 500; error: string };

const BAD: ParsedSign = { ok: false, status: 400, error: "bad request" };
const UNCONFIGURED: ParsedSign = { ok: false, status: 500, error: "signer not configured" };

const SECTION_KEYS = new Set(["history", "meds", "labs", "imaging", "notes"]);
const METHOD_SET = new Set<string>(SIGN_METHODS);
const ROLE_SET = new Set<string>(SIGN_ROLES);
const ACCOUNT_ID = /^(?:[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?)*$/;
const IMPLICIT_ACCOUNT = /^[0-9a-f]{64}$/;

function isPlain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return allowedKeys(value, keys, []);
}

function allowedKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]): boolean {
  const present = Object.keys(value);
  if (!required.every((key) => present.includes(key))) return false;
  return present.every((key) => required.includes(key) || optional.includes(key));
}

function optionalHex(value: Record<string, unknown>, key: string): string | null | undefined {
  if (!Object.hasOwn(value, key)) return undefined;
  return hex64(value[key]);
}

function optionalEpoch(value: Record<string, unknown>): string | null | undefined {
  if (!Object.hasOwn(value, "expected_epoch")) return undefined;
  return canonicalU64(value.expected_epoch);
}

function isSignMethod(value: string): value is SignMethod {
  return METHOD_SET.has(value);
}

function isSignRole(value: string): value is SignRole {
  return ROLE_SET.has(value);
}

export function isAccountId(value: string): boolean {
  if (IMPLICIT_ACCOUNT.test(value)) return true;
  return value.length >= 2 && value.length <= 64 && ACCOUNT_ID.test(value);
}

function hex64(value: unknown): string | null {
  if (typeof value !== "string" || value.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(value)) return null;
  return value.toLowerCase();
}

function decimalId(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 20 || !/^[1-9][0-9]{0,19}$/.test(value)) return null;
  return value;
}

type Bound = { ok: true; account: string } | { ok: false; failure: ParsedSign };

function bindAccount(value: unknown, expected: string | undefined): Bound {
  if (typeof value !== "string" || !isAccountId(value)) return { ok: false, failure: BAD };
  if (!expected || !isAccountId(expected)) return { ok: false, failure: UNCONFIGURED };
  if (value !== expected) return { ok: false, failure: BAD };
  return { ok: true, account: expected };
}

function sectionNames(value: unknown, min: number): string[] | null {
  if (!Array.isArray(value) || value.length > 5 || value.length < min) return null;
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !SECTION_KEYS.has(item) || seen.has(item)) return null;
    seen.add(item);
    names.push(item);
  }
  return names;
}

function sectionMetas(value: unknown): { key: string; cipher_hash: string }[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) return null;
  const metas: { key: string; cipher_hash: string }[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isPlain(item) || !exactKeys(item, ["key", "cipher_hash"])) return null;
    const key = item.key;
    const cipher = hex64(item.cipher_hash);
    if (typeof key !== "string" || !SECTION_KEYS.has(key) || seen.has(key) || !cipher) return null;
    seen.add(key);
    metas.push({ key, cipher_hash: cipher });
  }
  return metas;
}

function parseArgs(
  method: SignMethod,
  args: Record<string, unknown>,
  accounts: SignAccounts | null,
  patientAccount: string | null,
): ParsedSign | { ok: true; args: Record<string, unknown> } {
  if (method === "create_record") {
    if (!allowedKeys(args, ["patient", "sections"], ["request_id"])) return BAD;
    const sections = sectionMetas(args.sections);
    const requestId = optionalHex(args, "request_id");
    if (!sections || requestId === null) return BAD;
    if (!patientAccount) return { ok: false, status: 403, error: "patient not bound" };
    const patient = bindAccount(args.patient, patientAccount);
    if (!patient.ok) return patient.failure;
    return { ok: true, args: { patient: patient.account, sections, ...(requestId ? { request_id: requestId } : {}) } };
  }
  if (method === "request_referral") {
    if (!allowedKeys(args, ["record_id", "to", "requested_sections", "purpose_hash"], ["request_id", "expected_epoch"])) return BAD;
    const recordId = canonicalU64(args.record_id);
    const requested = sectionNames(args.requested_sections, 1);
    const purpose = hex64(args.purpose_hash);
    const requestId = optionalHex(args, "request_id");
    const epoch = optionalEpoch(args);
    if (!recordId || !requested || !purpose || requestId === null || epoch === null) return BAD;
    const to = bindAccount(args.to, accounts?.hospital);
    if (!to.ok) return to.failure;
    return {
      ok: true,
      args: {
        record_id: recordId,
        to: to.account,
        requested_sections: requested,
        purpose_hash: purpose,
        ...(requestId ? { request_id: requestId } : {}),
        ...(epoch ? { expected_epoch: epoch } : {}),
      },
    };
  }
  if (method === "approve_share") {
    if (!exactKeys(args, ["share_id", "granted_sections", "expires_at_ns", "read_only", "artifact_hash", "tee_receipt_hash"])) return BAD;
    const shareId = canonicalU64(args.share_id);
    const granted = sectionNames(args.granted_sections, 1);
    const expires = decimalId(args.expires_at_ns);
    const artifact = hex64(args.artifact_hash);
    const receipt = hex64(args.tee_receipt_hash);
    if (typeof args.read_only !== "boolean" || !shareId || !granted || !expires || !artifact || !receipt) return BAD;
    return {
      ok: true,
      args: {
        share_id: shareId,
        granted_sections: granted,
        expires_at_ns: expires,
        read_only: args.read_only,
        artifact_hash: artifact,
        tee_receipt_hash: receipt,
      },
    };
  }
  if (method === "create_share") {
    if (!allowedKeys(args, ["record_id", "to", "kind", "sections", "expires_at_ns", "read_only", "purpose_hash", "artifact_hash", "tee_receipt_hash", "parent"], ["request_id", "expected_epoch"])) {
      return BAD;
    }
    const requestId = optionalHex(args, "request_id");
    const epoch = optionalEpoch(args);
    if (requestId === null || epoch === null) return BAD;
    const kind = args.kind;
    if (kind !== "SecondOpinion" && kind !== "DeidApp") return BAD;
    const recordId = canonicalU64(args.record_id);
    const expires = decimalId(args.expires_at_ns);
    const purpose = hex64(args.purpose_hash);
    const artifact = hex64(args.artifact_hash);
    if (typeof args.read_only !== "boolean" || !recordId || !expires || !purpose || !artifact) return BAD;
    if (kind === "SecondOpinion") {
      const sections = sectionNames(args.sections, 1);
      const parent = canonicalU64(args.parent);
      if (args.tee_receipt_hash !== null || !sections || !parent) return BAD;
      const to = bindAccount(args.to, accounts?.second);
      if (!to.ok) return to.failure;
      return {
        ok: true,
        args: {
          record_id: recordId,
          to: to.account,
          kind,
          sections,
          expires_at_ns: expires,
          read_only: args.read_only,
          purpose_hash: purpose,
          artifact_hash: artifact,
          tee_receipt_hash: null,
          parent,
          ...(requestId ? { request_id: requestId } : {}),
          ...(epoch ? { expected_epoch: epoch } : {}),
        },
      };
    }
    const receipt = hex64(args.tee_receipt_hash);
    if (!Array.isArray(args.sections) || args.sections.length !== 0 || args.parent !== null || !receipt) return BAD;
    const to = bindAccount(args.to, accounts?.app);
    if (!to.ok) return to.failure;
    return {
      ok: true,
      args: {
        record_id: recordId,
        to: to.account,
        kind,
        sections: [],
        expires_at_ns: expires,
        read_only: args.read_only,
        purpose_hash: purpose,
        artifact_hash: artifact,
        tee_receipt_hash: receipt,
        parent: null,
        ...(requestId ? { request_id: requestId } : {}),
        ...(epoch ? { expected_epoch: epoch } : {}),
      },
    };
  }
  if (method === "request_open") {
    if (!exactKeys(args, ["share_id", "nonce_hash"])) return BAD;
    const shareId = canonicalU64(args.share_id);
    const nonce = hex64(args.nonce_hash);
    if (!shareId || !nonce) return BAD;
    return { ok: true, args: { share_id: shareId, nonce_hash: nonce } };
  }
  if (method === "submit_reply") {
    if (!allowedKeys(args, ["share_id", "reply_hash"], ["request_id", "expected_epoch"])) return BAD;
    const shareId = canonicalU64(args.share_id);
    const reply = hex64(args.reply_hash);
    const requestId = optionalHex(args, "request_id");
    const epoch = optionalEpoch(args);
    if (!shareId || !reply || requestId === null || epoch === null) return BAD;
    return {
      ok: true,
      args: {
        share_id: shareId,
        reply_hash: reply,
        ...(requestId ? { request_id: requestId } : {}),
        ...(epoch ? { expected_epoch: epoch } : {}),
      },
    };
  }
  if (method === "revoke_all_for_record") {
    if (!allowedKeys(args, ["record_id"], ["expected_epoch"])) return BAD;
    const recordId = canonicalU64(args.record_id);
    const epoch = optionalEpoch(args);
    if (!recordId || epoch === null) return BAD;
    return { ok: true, args: { record_id: recordId, ...(epoch ? { expected_epoch: epoch } : {}) } };
  }
  if (!exactKeys(args, ["share_id"])) return BAD;
  const shareId = canonicalU64(args.share_id);
  if (!shareId) return BAD;
  return { ok: true, args: { share_id: shareId } };
}

export function parseSignBody(body: unknown, accounts: SignAccounts | null, options?: SignParseOptions): ParsedSign {
  if (!isPlain(body) || !exactKeys(body, ["role", "method", "args"])) return BAD;
  const role = body.role;
  const method = body.method;
  const args = body.args;
  if (typeof role !== "string" || typeof method !== "string" || !isPlain(args)) return BAD;
  if (!isSignMethod(method) || !isSignRole(role)) return BAD;
  if (!METHOD_ROLES[method].includes(role)) return BAD;
  const allowPatientRole = options?.allowPatientRole ?? true;
  if (role === "patient" && !allowPatientRole) return { ok: false, status: 403, error: "browser signs this" };
  const patientAccount = options ? options.patientAccount : (accounts?.patient ?? null);
  const parsed = parseArgs(method, args, accounts, patientAccount);
  if (!parsed.ok) return parsed;
  return { ok: true, role, method, args: parsed.args };
}
