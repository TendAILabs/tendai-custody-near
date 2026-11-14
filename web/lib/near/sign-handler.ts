import { guardRequest, type HitStore } from "../guard/visitor.ts";
import { stateChangeGuard } from "../http/origin.ts";
import {
  authorizeStoryMethod,
  finishSummaryReceipt,
  readVisitorSession,
  releaseIssuedReceipt,
  releaseSummaryReceipt,
  rememberStoryResult,
  writeVisitorCookie,
  type VisitorSession,
} from "../session/visitor.ts";
import { bytesToHex } from "@noble/hashes/utils.js";
import { ContractCallError, callContract } from "./call.ts";
import { parseSignBody, type SignAccounts, type SignMethod, type SignParseOptions, type SignRole } from "./sign-allow.ts";
import { faucetConfigured } from "../visitor/faucet-env.ts";

const PAYABLE = new Set<SignMethod>(["approve_share", "decline_share", "create_share", "revoke_share", "revoke_all_for_record"]);
const CREATION = new Set<SignMethod>(["create_record", "request_referral", "create_share", "submit_reply"]);

function freshRequestId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function withRequestId(method: SignMethod, args: Record<string, unknown>): Record<string, unknown> {
  if (!CREATION.has(method) || typeof args.request_id === "string") return args;
  return { ...args, request_id: freshRequestId() };
}

function uncertainCall(error: unknown): boolean {
  if (error instanceof ContractCallError) return !error.definite && !error.retried;
  const text = error instanceof Error ? error.message : String(error);
  return !/ERR_[A-Z0-9_]+/.test(text);
}

async function invoke(
  call: (input: SignCallInput) => Promise<{ hash: string; value: unknown }>,
  input: SignCallInput,
): Promise<{ hash: string; value: unknown }> {
  try {
    return await call(input);
  } catch (error) {
    if (!CREATION.has(input.methodName as SignMethod) || !uncertainCall(error)) throw error;
    return await call(input);
  }
}

const SIGNER_ENV: Record<SignRole, { id: string; key: string }> = {
  clinic: { id: "CLINIC_A_ACCOUNT_ID", key: "CLINIC_A_FC_PRIVATE_KEY" },
  hospital: { id: "HOSPITAL_B_ACCOUNT_ID", key: "HOSPITAL_B_FC_PRIVATE_KEY" },
  second: { id: "SECOND_OPINION_ACCOUNT_ID", key: "SECOND_OPINION_FC_PRIVATE_KEY" },
  app: { id: "PULSEFIT_ACCOUNT_ID", key: "PULSEFIT_FC_PRIVATE_KEY" },
  patient: { id: "DEMO_PATIENT_ACCOUNT_ID", key: "DEMO_PATIENT_PRIVATE_KEY" },
};

export type SignCallInput = {
  accountId: string;
  secret: string;
  methodName: string;
  args: Record<string, unknown>;
  deposit: bigint;
};

export type SignHandlerDeps = {
  now?: number;
  store?: HitStore;
  secret?: string;
  accounts?: SignAccounts | null;
  signers?: Partial<Record<SignRole, { accountId: string; secret: string }>>;
  contractId?: string;
  call?: (input: SignCallInput) => Promise<{ hash: string; value: unknown }>;
};

function accountsFromEnv(): SignAccounts | null {
  const accounts = {
    clinic: process.env.CLINIC_A_ACCOUNT_ID ?? "",
    patient: process.env.DEMO_PATIENT_ACCOUNT_ID ?? "",
    hospital: process.env.HOSPITAL_B_ACCOUNT_ID ?? "",
    second: process.env.SECOND_OPINION_ACCOUNT_ID ?? "",
    app: process.env.PULSEFIT_ACCOUNT_ID ?? "",
  };
  if (Object.values(accounts).some((id) => id.length === 0)) return null;
  return accounts;
}

function signOptions(session: VisitorSession | null, accounts: SignAccounts | null): SignParseOptions {
  if (session?.patient && session.patientMode === "demo") return { allowPatientRole: true, patientAccount: session.patient };
  const bound = Boolean(session && session.patient && (session.patientMode === "local" || session.patientMode === "wallet"));
  if (bound && session) return { allowPatientRole: false, patientAccount: session.patient };
  if (faucetConfigured()) return { allowPatientRole: false, patientAccount: null };
  return { allowPatientRole: true, patientAccount: accounts?.patient || null };
}

function signerFor(role: SignRole, override: SignHandlerDeps["signers"]): { accountId: string; secret: string } {
  const chosen = override?.[role];
  if (chosen) return { accountId: chosen.accountId, secret: chosen.secret };
  const spec = SIGNER_ENV[role];
  return { accountId: process.env[spec.id] ?? "", secret: process.env[spec.key] ?? "" };
}

async function releaseClaim(session: VisitorSession, method: SignMethod, args: Record<string, unknown>, now: number): Promise<void> {
  if (method === "create_share" && args.kind === "DeidApp" && typeof args.tee_receipt_hash === "string" && typeof args.artifact_hash === "string") {
    await releaseIssuedReceipt(session, args.tee_receipt_hash, args.artifact_hash);
  }
  if (method === "approve_share" && typeof args.share_id === "string" && typeof args.tee_receipt_hash === "string") {
    await releaseSummaryReceipt(session, args.share_id, args.tee_receipt_hash, now);
  }
}

export async function handleSign(request: Request, deps?: SignHandlerDeps): Promise<Response> {
  const guarded = stateChangeGuard(request);
  if (guarded) {
    console.log(`[sign] POST ${guarded.status}`);
    return guarded;
  }
  const started = performance.now();
  const now = deps?.now ?? Date.now();
  const elapsed = () => Math.round(performance.now() - started);
  const fail = (status: number, error: string, method = ""): Response => {
    console.log(`[sign] POST ${status}${method ? ` ${method}` : ""} ${elapsed()}ms`);
    return Response.json({ error }, { status });
  };
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return fail(400, "bad request");
  }
  const accounts = deps?.accounts !== undefined ? deps.accounts : accountsFromEnv();
  const secret = deps?.secret !== undefined ? deps.secret : (process.env.DEMO_SESSION_SECRET ?? "");
  const session = secret ? readVisitorSession(request.headers.get("cookie"), secret, now) : null;
  const parsed = parseSignBody(parsedBody, accounts, signOptions(session, accounts));
  if (!parsed.ok) return fail(parsed.status, parsed.error);
  const { role, method, args } = parsed;
  if (!secret) return fail(500, "signer not configured", method);
  const allowed = await authorizeStoryMethod(session, method, args, now);
  if (!allowed.ok || !session) {
    const status = allowed.ok ? 401 : allowed.status;
    const error = allowed.ok ? "sign in required" : allowed.error;
    return fail(status, error, method);
  }
  const signer = signerFor(role, deps?.signers);
  const contractId = deps?.contractId !== undefined ? deps.contractId : (process.env.RELAY_CONTRACT_ID ?? "");
  if (!signer.accountId || !signer.secret || !contractId) {
    await releaseClaim(session, method, args, now);
    return fail(500, "signer not configured", method);
  }
  const limited = await guardRequest(request, "sign", { store: deps?.store, now });
  if (limited) {
    await releaseClaim(session, method, args, now);
    console.log(`[sign] POST 429 ${method} ${elapsed()}ms`);
    return limited;
  }
  const call = deps?.call ?? callContract;
  const chainArgs = withRequestId(method, args);
  try {
    const result = await invoke(call, {
      accountId: signer.accountId,
      secret: signer.secret,
      methodName: method,
      args: chainArgs,
      deposit: PAYABLE.has(method) ? BigInt(1) : BigInt(0),
    });
    const next = rememberStoryResult(session, method, result.value);
    if (method === "approve_share" && typeof args.share_id === "string" && typeof args.tee_receipt_hash === "string") {
      finishSummaryReceipt(next, args.share_id, args.tee_receipt_hash);
    }
    const secure = new URL(request.url).protocol === "https:";
    console.log(`[sign] POST 200 ${method} ${elapsed()}ms`);
    return Response.json(result, { headers: { "set-cookie": writeVisitorCookie(next, secret, secure) } });
  } catch (error) {
    await releaseClaim(session, method, args, now);
    const text = error instanceof Error ? error.message : "";
    const message = /ERR_[A-Z0-9_]+/.exec(text)?.[0] ?? "sign failed";
    return fail(400, message, method);
  }
}
