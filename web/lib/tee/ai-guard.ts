import { clientIp, guardRequest, refundAdmission, type HitStore } from "../guard/visitor.ts";
import { readVisitorSession, type VisitorSession } from "../session/visitor.ts";

export const SIGN_IN_REQUIRED = "sign in required";
export const UNAVAILABLE = "unavailable";

export type GuardOptions = {
  now?: number;
  store?: HitStore;
};

const ATTEMPT_SENT = Symbol.for("rr.attemptSent");

export function markAttemptSent(error: unknown): void {
  if (!error || typeof error !== "object") return;
  Object.defineProperty(error, ATTEMPT_SENT, { value: true });
}

export function attemptWasSent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if ((value as { [ATTEMPT_SENT]?: boolean })[ATTEMPT_SENT] === true) return true;
  return (value as { attemptSent?: boolean }).attemptSent === true;
}

export function callWasNotSent(value: unknown): boolean {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  return (
    message.includes("No NEAR AI request was sent") ||
    message.includes("No request was sent") ||
    message.includes("No NEAR AI call was sent")
  );
}

export function deny(status: 400 | 401 | 403 | 409 | 422 | 503, error: string, fields?: Record<string, unknown>): Response {
  return Response.json(fields ? { ...fields, error } : { error }, { status, headers: { "cache-control": "no-store" } });
}

export function requireVisitor(
  request: Request,
  secret: string,
  now: number,
  fields?: Record<string, unknown>,
): { ok: true; session: VisitorSession } | { ok: false; response: Response } {
  if (!secret) return { ok: false, response: deny(503, UNAVAILABLE, fields) };
  const session = readVisitorSession(request.headers.get("cookie"), secret, now);
  if (!session) return { ok: false, response: deny(401, SIGN_IN_REQUIRED, fields) };
  return { ok: true, session };
}

export function chargeAi(request: Request, options?: GuardOptions): Promise<Response | null> {
  return guardRequest(request, "ai", options);
}

export function refundAi(request: Request, options?: GuardOptions): Promise<void> {
  return refundAdmission({ ip: clientIp(request), kind: "ai", now: options?.now, store: options?.store });
}

export function configuredSecret(override: string | undefined): string {
  if (override !== undefined) return override;
  return process.env.DEMO_SESSION_SECRET ?? "";
}

export function configuredKey(override: boolean | undefined): boolean {
  if (override !== undefined) return override;
  return Boolean(process.env.NEARAI_API_KEY?.trim());
}
