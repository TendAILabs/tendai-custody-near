import { clientIp, type HitStore } from "../guard/visitor.ts";
import { canonicalOrigin, stateChangeGuard } from "../http/origin.ts";
import { isAccountId } from "../near/sign-allow.ts";
import {
  bindPatient,
  clearPatient,
  newVisitorSession,
  readVisitorSession,
  rememberChallenge,
  writeVisitorCookie,
  type VisitorSession,
} from "../session/visitor.ts";
import { readBalanceYocto, transferFromFaucet } from "./chain.ts";
import { faucetConfigured } from "./faucet-env.ts";
import { SPONSOR_FLOOR_YOCTO, SPONSOR_YOCTO, admitChallenge, admitFaucet, faucetStore, limitDenied, refundFaucet } from "./limits.ts";
import { BALANCE_UNKNOWN, fundVisitor, TRANSFER_UNCONFIRMED, type TxStatus } from "./funding.ts";

export const LOGIN_MESSAGE = "TendAI Custody testnet login";
const CHALLENGE_MS = 10 * 60 * 1000;

export type Nep413Check = {
  accountId: string;
  publicKey: string;
  signature: Uint8Array;
  nonce: Uint8Array;
  message: string;
  recipient: string;
};

export type VisitorBindDeps = {
  now?: number;
  secret?: string;
  store?: HitStore;
  configured?: boolean;
  verify?: (input: Nep413Check) => Promise<boolean>;
  balance?: (accountId: string) => Promise<bigint | null>;
  transfer?: (to: string, yocto: bigint) => Promise<string>;
  txStatus?: (hash: string) => Promise<TxStatus>;
};

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  const present = Object.keys(value);
  return present.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function cookie(session: VisitorSession, secret: string, secure: boolean): HeadersInit {
  return { "cache-control": "no-store", "set-cookie": writeVisitorCookie(session, secret, secure) };
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "method not allowed" },
    { status: 405, headers: { "cache-control": "no-store", allow: "POST" } },
  );
}

export async function handleVisitorChallenge(request: Request, deps?: VisitorBindDeps): Promise<Response> {
  // POST only. Same-origin GET does not send Origin, and stateChangeGuard then
  // returns 403 when VERCEL or DEMO_CANONICAL_ORIGIN is set. A non-POST returns
  // 405 before that check and does not mint a nonce.
  if (request.method !== "POST") return methodNotAllowed();
  const now = deps?.now ?? Date.now();
  const guarded = stateChangeGuard(request, { json: false });
  if (guarded) return guarded;
  const secret = deps?.secret !== undefined ? deps.secret : (process.env.DEMO_SESSION_SECRET ?? "");
  if (!secret) return Response.json({ error: "signer not configured" }, { status: 500, headers: { "cache-control": "no-store" } });
  const store = deps?.store ?? faucetStore();
  const admitted = await admitChallenge(store, clientIp(request), now);
  if (!admitted.ok) return limitDenied(admitted, now);
  const secure = new URL(request.url).protocol === "https:";
  const session = readVisitorSession(request.headers.get("cookie"), secret, now) ?? newVisitorSession(now);
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  rememberChallenge(session, nonce, now + CHALLENGE_MS);
  const recipient = canonicalOrigin(request);
  return Response.json(
    { message: LOGIN_MESSAGE, recipient, nonce, network: "testnet" },
    { headers: cookie(session, secret, secure) },
  );
}

export async function handleVisitorBind(request: Request, deps?: VisitorBindDeps): Promise<Response> {
  const now = deps?.now ?? Date.now();
  const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
  const secret = deps?.secret !== undefined ? deps.secret : (process.env.DEMO_SESSION_SECRET ?? "");
  if (!secret) return fail(500, "signer not configured");
  const guarded = stateChangeGuard(request);
  if (guarded) return guarded;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad request");
  }
  if (!plain(body) || !exact(body, ["accountId", "publicKey", "signature", "encPubkey"])) return fail(400, "bad request");
  const accountId = body.accountId;
  const publicKey = body.publicKey;
  const signature = body.signature;
  const encPubkey = body.encPubkey;
  if (typeof accountId !== "string" || typeof publicKey !== "string" || typeof signature !== "string" || typeof encPubkey !== "string") {
    return fail(400, "bad request");
  }
  if (!isAccountId(accountId) || accountId.endsWith(".near")) return fail(400, "bad request");
  if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]+$/.test(publicKey)) return fail(400, "bad request");
  if (!/^[0-9a-f]{64}$/i.test(encPubkey)) return fail(400, "bad request");
  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signature, "base64");
  } catch {
    return fail(400, "bad request");
  }
  if (signatureBytes.length !== 64) return fail(400, "bad request");
  const secure = new URL(request.url).protocol === "https:";
  const session = readVisitorSession(request.headers.get("cookie"), secret, now);
  if (!session) return fail(401, "sign in required");
  if (!session.challengeNonce || session.challengeExp < now) return fail(403, "challenge expired");
  const nonce = Buffer.from(session.challengeNonce, "base64url");
  if (nonce.length !== 32) return fail(403, "challenge expired");
  const store = deps?.store ?? faucetStore();
  const ip = clientIp(request);
  const admitted = await admitFaucet(store, ip, now);
  if (!admitted.ok) return limitDenied(admitted, now);
  const recipient = canonicalOrigin(request);
  const verify = deps?.verify ?? verifyNep413;
  const ok = await verify({
    accountId,
    publicKey,
    signature: new Uint8Array(signatureBytes),
    nonce: new Uint8Array(nonce),
    message: LOGIN_MESSAGE,
    recipient,
  });
  if (!ok) {
    await refundFaucet(store, ip, now);
    return fail(403, "signature rejected");
  }
  session.challengeNonce = "";
  session.challengeExp = 0;
  let fundingTx = "";
  let needsFunds = false;
  const configured = deps?.configured ?? faucetConfigured();
  if (configured) {
    const balance = deps?.balance ?? (async (id: string) => {
      try {
        return await readBalanceYocto(id);
      } catch {
        return null;
      }
    });
    const yocto = await balance(accountId);
    if (yocto == null) {
      await refundFaucet(store, ip, now);
      return fail(503, BALANCE_UNKNOWN);
    }
    if (yocto < SPONSOR_FLOOR_YOCTO) {
      const transfer = deps?.transfer ?? transferFromFaucet;
      const outcome = await fundVisitor({
        store,
        accountId,
        visitorFloor: SPONSOR_FLOOR_YOCTO,
        amount: SPONSOR_YOCTO,
        visitorBalance: async () => yocto,
        transfer: (amount) => transfer(accountId, amount),
        txStatus: deps?.txStatus,
      });
      if (outcome.action === "sent") fundingTx = outcome.txHash;
      if (outcome.action === "already") {
        fundingTx = outcome.txHash;
        await refundFaucet(store, ip, now);
      }
      if (outcome.action === "pending" && outcome.held) return fail(503, TRANSFER_UNCONFIRMED);
      if (outcome.action === "pending" || outcome.action === "unknown" || outcome.action === "low") {
        await refundFaucet(store, ip, now);
        if (outcome.action === "low") needsFunds = true;
        else return fail(503, outcome.action === "unknown" ? BALANCE_UNKNOWN : TRANSFER_UNCONFIRMED);
      }
    } else {
      await refundFaucet(store, ip, now);
    }
  } else {
    await refundFaucet(store, ip, now);
    needsFunds = true;
  }
  bindPatient(session, accountId, "wallet", encPubkey.toLowerCase(), fundingTx);
  return Response.json(
    {
      accountId,
      mode: "wallet",
      encPubkey: encPubkey.toLowerCase(),
      fundingTx,
      needsFunds,
      faucetUrl: "https://docs.near.org/getting-started/faucet",
      faucetSite: "https://near-faucet.io/",
    },
    { headers: cookie(session, secret, secure) },
  );
}

export async function handleVisitorSignOut(request: Request, deps?: VisitorBindDeps): Promise<Response> {
  const now = deps?.now ?? Date.now();
  const guarded = stateChangeGuard(request);
  if (guarded) return guarded;
  const secret = deps?.secret !== undefined ? deps.secret : (process.env.DEMO_SESSION_SECRET ?? "");
  if (!secret) return Response.json({ error: "signer not configured" }, { status: 500, headers: { "cache-control": "no-store" } });
  const secure = new URL(request.url).protocol === "https:";
  const session = readVisitorSession(request.headers.get("cookie"), secret, now) ?? newVisitorSession(now);
  clearPatient(session);
  return Response.json({ ok: true }, { headers: cookie(session, secret, secure) });
}

export async function verifyNep413(input: Nep413Check): Promise<boolean> {
  const { verifyMessage } = await import("near-api-js/nep413");
  const { JsonRpcProvider } = await import("near-api-js");
  try {
    await verifyMessage({
      signerAccountId: input.accountId,
      signerPublicKey: input.publicKey,
      signature: input.signature,
      payload: { message: input.message, recipient: input.recipient, nonce: input.nonce },
      provider: new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" }),
    });
    return true;
  } catch {
    return false;
  }
}
