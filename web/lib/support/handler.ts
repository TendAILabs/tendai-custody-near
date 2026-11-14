import { ipAddress } from "@vercel/functions";
import { stateChangeGuard, canonicalOrigin } from "../http/origin.ts";
import { assistHasPersonalIdentifier } from "../assist/demo-names.ts";
import { isAccountId } from "../near/sign-allow.ts";
import { verifyNep413, type Nep413Check } from "../visitor/bind.ts";
import { hexToBytes, supportMessage, SUPPORT_MESSAGE_MAX, SUPPORT_SUBJECT_MAX, type SupportAction } from "./message.ts";
import { openSupport, type LimitDecision, type SupportLimits, type Ticket, type TicketStore } from "./store.ts";

export const SUPPORT_WALLET_LIMIT = 6;
export const SUPPORT_IP_LIMIT = 12;
export const SUPPORT_OPEN_CAP = 20;
const PUBLIC_KEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]+$/;

export type SupportDeps = {
  now?: number;
  tickets?: TicketStore;
  limits?: SupportLimits;
  ownerId?: string;
  verify?: (input: Nep413Check) => Promise<boolean>;
};

function fail(status: number, error: string): Response {
  console.log(`[support] POST ${status}`);
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

function ok(body: Record<string, unknown>, status = 200): Response {
  console.log(`[support] POST ${status}`);
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function cleanAddress(value: string): string {
  const ip = value.trim().replace(/^::ffff:/, "");
  if (!ip || ip.length > 80 || /[\s,]/.test(ip)) return "";
  return ip;
}

// Vercel overwrites x-forwarded-for, so the first hop is the client and is trusted only on Vercel.
// Off Vercel that header is supplied by the caller, and every request shares the local bucket.
export function supportClientIp(request: Request): string {
  if (!process.env.VERCEL) return "local";
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = cleanAddress(forwarded.split(",")[0] ?? "");
  if (first) return first;
  const real = cleanAddress(request.headers.get("x-real-ip") ?? "");
  if (real) return real;
  try {
    const helper = cleanAddress(ipAddress(request) ?? "");
    if (helper) return helper;
  } catch {
    return "unknown";
  }
  return "unknown";
}

function limitGate(kind: "ip" | "wallet", decision: LimitDecision): Response | null {
  console.log(`[support] ${kind} ${decision === "allow" ? "allow" : "deny"}`);
  if (decision === "allow") return null;
  if (decision === "error") return fail(503, "Support is busy. Try again in a moment.");
  const error = kind === "ip"
    ? "Too many support tries from this network. Wait a little, then try again."
    : "Too many support notes from this wallet. Wait a little, then try again.";
  return fail(429, error);
}

function supportAdminAccount(deps?: SupportDeps): string {
  if (deps?.ownerId !== undefined) return deps.ownerId.trim();
  return (process.env.SUPPORT_ADMIN_ACCOUNT_ID ?? "").trim();
}


function publicTicket(ticket: Ticket) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    createdAt: ticket.createdAt,
    reply: ticket.reply,
    repliedAt: ticket.repliedAt,
  };
}

function adminCursor(value: unknown): string {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 999999) return String(value);
  if (typeof value === "string" && /^\d{1,6}$/.test(value)) return value;
  return "0";
}

function pathKind(url: string): "challenge" | "admin" | "user" {
  const path = new URL(url).pathname.replace(/\/$/, "");
  if (path.endsWith("/challenge")) return "challenge";
  if (path.endsWith("/admin")) return "admin";
  return "user";
}

export async function handleSupport(request: Request, deps?: SupportDeps): Promise<Response> {
  if (request.method !== "POST") return fail(405, "method not allowed");
  const guarded = stateChangeGuard(request);
  if (guarded) {
    console.log(`[support] POST ${guarded.status}`);
    return guarded;
  }
  const now = deps?.now ?? Date.now();
  const kind = pathKind(request.url);
  const backend = deps?.tickets && deps.limits ? { tickets: deps.tickets, limits: deps.limits } : openSupport(SUPPORT_IP_LIMIT, SUPPORT_WALLET_LIMIT);
  if (!backend) return fail(503, "Support storage is not configured.");
  const { tickets, limits } = backend;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad request");
  }
  if (!plain(body)) return fail(400, "bad request");
  if (kind === "challenge") {
    const challengeLimit = await limits.ip(supportClientIp(request), now);
    const challengeBlocked = limitGate("ip", challengeLimit);
    if (challengeBlocked) return challengeBlocked;
    const nonce = await tickets.issueNonce(now);
    return ok({ nonce, recipient: canonicalOrigin(request) });
  }
  const action = body.action;
  if (action !== "create" && action !== "list" && action !== "admin" && action !== "reply" && action !== "close") return fail(400, "bad request");
  if (kind === "admin" && action !== "admin" && action !== "reply" && action !== "close") return fail(400, "bad request");
  if (kind === "user" && action !== "create" && action !== "list") return fail(400, "bad request");
  const accountId = body.accountId;
  const publicKey = body.publicKey;
  const signature = body.signature;
  const nonce = body.nonce;
  if (typeof accountId !== "string" || !isAccountId(accountId)) return fail(400, "bad request");
  if (typeof publicKey !== "string" || !PUBLIC_KEY.test(publicKey)) return fail(400, "bad request");
  if (typeof signature !== "string" || typeof nonce !== "string") return fail(400, "bad request");
  const nonceBytes = hexToBytes(nonce);
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = new Uint8Array(Buffer.from(signature, "base64"));
  } catch {
    return fail(400, "bad request");
  }
  if (!nonceBytes || signatureBytes.length !== 64) return fail(400, "bad request");
  const subject = action === "create" ? text(body.subject, SUPPORT_SUBJECT_MAX) : "";
  const message = action === "create" ? text(body.message, SUPPORT_MESSAGE_MAX) : "";
  const reply = action === "reply" ? text(body.reply, SUPPORT_MESSAGE_MAX) : "";
  const ticketId = action === "reply" || action === "close" ? text(body.ticketId, 64) : "";
  if (action === "create" && (!subject || !message)) {
    const tooLong = typeof body.message === "string" && body.message.trim().length > SUPPORT_MESSAGE_MAX;
    const subjectLong = typeof body.subject === "string" && body.subject.trim().length > SUPPORT_SUBJECT_MAX;
    if (tooLong) return fail(400, "Keep the message under 2000 characters.");
    if (subjectLong) return fail(400, "Keep the subject under 120 characters.");
    return fail(400, "Add a subject and a message.");
  }
  if ((action === "reply" || action === "close") && !ticketId) return fail(400, "bad request");
  if (action === "reply" && !reply) {
    if (typeof body.reply === "string" && body.reply.trim().length > SUPPORT_MESSAGE_MAX) return fail(400, "Keep the reply under 2000 characters.");
    return fail(400, "Add a reply.");
  }
  const subjectText = subject ?? "";
  const messageText = message ?? "";
  const replyText = reply ?? "";
  const ticketText = ticketId ?? "";
  if (action === "create" && (assistHasPersonalIdentifier(subjectText) || assistHasPersonalIdentifier(messageText))) {
    return fail(422, "That note looks like it includes a personal identifier. This demo keeps fictional notes only. Take out real names and real health details, then try again.");
  }
  if (action === "reply" && assistHasPersonalIdentifier(replyText)) {
    return fail(422, "That reply looks like it includes a personal identifier. Take out real names and real health details, then try again.");
  }
  const ipLimit = await limits.ip(supportClientIp(request), now);
  const ipBlocked = limitGate("ip", ipLimit);
  if (ipBlocked) return ipBlocked;
  const signed = supportMessage(action as SupportAction, nonce, { subject: subjectText, message: messageText, ticketId: ticketText, reply: replyText });
  const recipient = canonicalOrigin(request);
  const verify = deps?.verify ?? verifyNep413;
  const accepted = await verify({
    accountId,
    publicKey,
    signature: signatureBytes,
    nonce: nonceBytes,
    message: signed,
    recipient,
  });
  if (!accepted) return fail(403, "That signature was not accepted. Sign in again.");
  if (!(await tickets.takeNonce(nonce, now))) return fail(403, "That sign-in was already used. Sign in again.");
  const walletLimit = await limits.wallet(accountId, now);
  const walletBlocked = limitGate("wallet", walletLimit);
  if (walletBlocked) return walletBlocked;
  if (kind === "admin" && accountId !== supportAdminAccount(deps)) return fail(403, "This wallet cannot open the support desk.");
  if (action === "create") {
    const held = await tickets.listWallet(accountId, now);
    const openCount = held.filter((ticket) => ticket.status !== "closed").length;
    if (openCount >= SUPPORT_OPEN_CAP) return fail(429, "This wallet already has the maximum number of open notes. Close one, then try again.");
    const ticket = await tickets.addTicket({ walletId: accountId, subject: subjectText, message: messageText, now });
    return ok({ id: ticket.id }, 201);
  }
  if (action === "list") {
    const mine = await tickets.listWallet(accountId, now);
    return ok({ tickets: mine.filter((ticket) => ticket.status === "open" || ticket.status === "answered").map(publicTicket) });
  }
  if (action === "admin") {
    const cursor = adminCursor(body.cursor);
    const page = await tickets.listAdmin(now, cursor);
    return ok({ tickets: page.tickets.map(publicTicket), cursor: page.cursor });
  }
  if (action === "reply") {
    const updated = await tickets.replyTicket(ticketText, replyText, now);
    if (!updated) return fail(404, "That ticket is already closed, or it is not here.");
    return ok({ ticket: publicTicket(updated) });
  }
  const closed = await tickets.closeTicket(ticketText, now);
  if (!closed) return fail(404, "That ticket is already closed, or it is not here.");
  return ok({ ticket: publicTicket(closed) });
}
