import { clientIp, type HitStore } from "../guard/visitor.ts";
import { stateChangeGuard, canonicalOrigin } from "../http/origin.ts";
import { isAccountId } from "../near/sign-allow.ts";
import { bindPatient, newVisitorSession, readVisitorSession, writeVisitorCookie } from "../session/visitor.ts";
import { implicitPublicKey, verifyLocalNep413 } from "../wallet/nep413.ts";
import { readBalanceYocto, transferFromFaucet } from "./chain.ts";
import { faucetConfigured } from "./faucet-env.ts";
import { FAUCET_FLOOR_YOCTO, FAUCET_TRANSFER_YOCTO, REGISTER_DEPOSIT_YOCTO, SPONSOR_YOCTO, admitFaucet, faucetStore, limitDenied, refundFaucet } from "./limits.ts";
import { BALANCE_UNKNOWN, fundVisitor, TRANSFER_UNCONFIRMED, type TxStatus } from "./funding.ts";
import { LOGIN_MESSAGE, verifyNep413 } from "./bind.ts";

const HEX64 = /^[0-9a-f]{64}$/;

export type VisitorStartDeps = {
  now?: number;
  secret?: string;
  store?: HitStore;
  configured?: boolean;
  balance?: () => Promise<bigint>;
  visitorBalance?: (accountId: string) => Promise<bigint>;
  transfer?: (to: string, yocto: bigint) => Promise<string>;
  txStatus?: (hash: string) => Promise<TxStatus>;
  verify?: (input: { accountId: string; signature: string; recipient: string; nonce: Uint8Array }) => Promise<boolean>;
};

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  const present = Object.keys(value);
  return present.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function implicitAccountId(publicKeyHex: string): string | null {
  const hex = publicKeyHex.toLowerCase();
  if (!HEX64.test(hex)) return null;
  return isAccountId(hex) ? hex : null;
}

export async function handleVisitorStart(request: Request, deps?: VisitorStartDeps): Promise<Response> {
  const now = deps?.now ?? Date.now();
  const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
  const guarded = stateChangeGuard(request);
  if (guarded) return guarded;
  const configured = deps?.configured ?? faucetConfigured();
  if (!configured) return fail(503, "faucet not configured");
  const secret = deps?.secret !== undefined ? deps.secret : (process.env.DEMO_SESSION_SECRET ?? "");
  if (!secret) return fail(500, "signer not configured");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad request");
  }
  if (!plain(body) || !exact(body, ["publicKey", "encPubkey", "signature"])) return fail(400, "bad request");
  if (typeof body.publicKey !== "string" || typeof body.encPubkey !== "string" || typeof body.signature !== "string") return fail(400, "bad request");
  const accountId = implicitAccountId(body.publicKey);
  const encPubkey = body.encPubkey.toLowerCase();
  if (!accountId || !HEX64.test(encPubkey)) return fail(400, "bad request");
  const secure = new URL(request.url).protocol === "https:";
  const current = readVisitorSession(request.headers.get("cookie"), secret, now) ?? newVisitorSession(now);
  if (current.patient === accountId && current.patientMode === "local") {
    return Response.json(
      { accountId, txHash: current.fundingTx, encPubkey: current.encPubkey || encPubkey, depositYocto: REGISTER_DEPOSIT_YOCTO, already: true },
      { headers: { "cache-control": "no-store", "set-cookie": writeVisitorCookie(current, secret, secure) } },
    );
  }
  const store = deps?.store ?? faucetStore();
  const ip = clientIp(request);
  const admitted = await admitFaucet(store, ip, now);
  if (!admitted.ok) return limitDenied(admitted, now);
  const recipient = canonicalOrigin(request);
  if (!current.challengeNonce || current.challengeExp < now) {
    await refundFaucet(store, ip, now);
    return fail(403, "challenge expired");
  }
  const nonce = Buffer.from(current.challengeNonce, "base64url");
  if (nonce.length !== 32) {
    await refundFaucet(store, ip, now);
    return fail(403, "challenge expired");
  }
  const signature = body.signature;
  const verified = deps?.verify
    ? await deps.verify({ accountId, signature, recipient, nonce: new Uint8Array(nonce) })
    : await verifyDeviceKey(accountId, signature, recipient, new Uint8Array(nonce));
  if (!verified) {
    await refundFaucet(store, ip, now);
    return fail(403, "signature rejected");
  }
  current.challengeNonce = "";
  current.challengeExp = 0;
  const settled = (status: number, payload: Record<string, unknown>) =>
    Response.json(payload, {
      status,
      headers: { "cache-control": "no-store", "set-cookie": writeVisitorCookie(current, secret, secure) },
    });
  const readVisitor = deps?.visitorBalance ?? readBalanceYocto;
  let knownBalance: bigint | null = null;
  try {
    knownBalance = await readVisitor(accountId);
  } catch {
    knownBalance = null;
  }
  if (knownBalance != null && knownBalance >= SPONSOR_YOCTO && !deps?.verify) {
    const chain = await verifyNep413({
      accountId,
      publicKey: implicitPublicKey(accountId),
      signature: new Uint8Array(Buffer.from(signature, "base64")),
      nonce: new Uint8Array(nonce),
      message: LOGIN_MESSAGE,
      recipient,
    });
    if (!chain) {
      await refundFaucet(store, ip, now);
      return settled(403, { error: "signature rejected" });
    }
  }
  const transfer = deps?.transfer ?? transferFromFaucet;
  const outcome = await fundVisitor({
    store,
    accountId,
    visitorFloor: SPONSOR_YOCTO,
    faucetFloor: FAUCET_FLOOR_YOCTO,
    amount: FAUCET_TRANSFER_YOCTO,
    visitorBalance: async () => {
      if (knownBalance != null) return knownBalance;
      return readVisitor(accountId);
    },
    faucetBalance: deps?.balance ?? (() => readBalanceYocto(process.env.RELAY_FAUCET_ACCOUNT_ID ?? "")),
    transfer: (amount) => transfer(accountId, amount),
    txStatus: deps?.txStatus,
  });
  if (outcome.action === "unknown") {
    await refundFaucet(store, ip, now);
    return settled(503, { error: BALANCE_UNKNOWN });
  }
  if (outcome.action === "low") {
    await refundFaucet(store, ip, now);
    return settled(503, { error: "faucet balance is low" });
  }
  if (outcome.action === "pending") {
    if (!outcome.held) await refundFaucet(store, ip, now);
    return settled(503, { error: TRANSFER_UNCONFIRMED });
  }
  if (outcome.action === "already") {
    await refundFaucet(store, ip, now);
    const next = bindPatient(current, accountId, "local", encPubkey, outcome.txHash || current.fundingTx);
    return Response.json(
      { accountId, txHash: outcome.txHash || current.fundingTx, encPubkey, depositYocto: REGISTER_DEPOSIT_YOCTO, already: true },
      { headers: { "cache-control": "no-store", "set-cookie": writeVisitorCookie(next, secret, secure) } },
    );
  }
  const next = bindPatient(current, accountId, "local", encPubkey, outcome.txHash);
  return Response.json(
    { accountId, txHash: outcome.txHash, encPubkey, depositYocto: REGISTER_DEPOSIT_YOCTO, already: false },
    { headers: { "cache-control": "no-store", "set-cookie": writeVisitorCookie(next, secret, secure) } },
  );
}

async function verifyDeviceKey(accountId: string, signature: string, recipient: string, nonce: Uint8Array): Promise<boolean> {
  if (nonce.length !== 32) return false;
  return verifyLocalNep413(accountId, signature, { message: LOGIN_MESSAGE, nonce, recipient });
}
