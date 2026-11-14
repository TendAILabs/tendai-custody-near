import { clientIp, type HitStore } from "../guard/visitor.ts";
import { stateChangeGuard } from "../http/origin.ts";
import { isAccountId } from "../near/sign-allow.ts";
import { bindPatient, newVisitorSession, readVisitorSession, writeVisitorCookie } from "../session/visitor.ts";
import { publicDemoConfig } from "../demo/config.ts";
import { admitDemoSession, faucetStore, limitDenied } from "./limits.ts";

export type VisitorDemoDeps = {
  now?: number;
  secret?: string;
  store?: HitStore;
  patientId?: string;
};

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function handleVisitorDemo(request: Request, deps?: VisitorDemoDeps): Promise<Response> {
  const now = deps?.now ?? Date.now();
  const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
  const guarded = stateChangeGuard(request);
  if (guarded) return guarded;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad request");
  }
  if (!plain(body) || Object.keys(body).length !== 0) return fail(400, "bad request");
  const secret = deps?.secret !== undefined ? deps.secret : (process.env.DEMO_SESSION_SECRET ?? "");
  if (!secret) return fail(500, "signer not configured");
  const patientId = deps?.patientId !== undefined ? deps.patientId : (publicDemoConfig()?.accounts.patient ?? "");
  if (!patientId || !isAccountId(patientId)) return fail(503, "demo not configured");
  const store = deps?.store ?? faucetStore();
  const admitted = await admitDemoSession(store, clientIp(request), now);
  if (!admitted.ok) return limitDenied(admitted, now);
  const current = readVisitorSession(request.headers.get("cookie"), secret, now) ?? newVisitorSession(now);
  const next = bindPatient(current, patientId, "demo", current.encPubkey);
  const secure = new URL(request.url).protocol === "https:";
  return Response.json(
    { accountId: patientId, mode: "demo" },
    { headers: { "cache-control": "no-store", "set-cookie": writeVisitorCookie(next, secret, secure) } },
  );
}
