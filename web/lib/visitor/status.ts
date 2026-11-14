import { publicDemoConfig } from "../demo/config.ts";
import { readVisitorSession, writeVisitorCookie } from "../session/visitor.ts";
import { faucetConfigured } from "./faucet-env.ts";

export const DEMO_SIGNER_LABEL = "The demo server holds this patient key on testnet.";
export const LOCAL_SIGNER_LABEL = "Demo key on this device";

export type VisitorStatus = {
  kind: "local-key" | "near-connect" | "demo-server" | "unbound";
  accountId: string;
  label: string;
  faucetConfigured: boolean;
  network: "testnet";
  encPubkey: string;
};

export function statusFor(sessionPatient: string, mode: "" | "local" | "wallet" | "demo", encPubkey: string, configured: boolean, demoPatient: string): VisitorStatus {
  if (mode === "local" && sessionPatient) {
    return { kind: "local-key", accountId: sessionPatient, label: LOCAL_SIGNER_LABEL, faucetConfigured: configured, network: "testnet", encPubkey };
  }
  if (mode === "wallet" && sessionPatient) {
    return { kind: "near-connect", accountId: sessionPatient, label: sessionPatient, faucetConfigured: configured, network: "testnet", encPubkey };
  }
  if (mode === "demo" && sessionPatient) {
    return { kind: "demo-server", accountId: sessionPatient, label: DEMO_SIGNER_LABEL, faucetConfigured: configured, network: "testnet", encPubkey };
  }
  if (!configured) {
    return { kind: "demo-server", accountId: demoPatient, label: DEMO_SIGNER_LABEL, faucetConfigured: false, network: "testnet", encPubkey: "" };
  }
  return { kind: "unbound", accountId: "", label: "", faucetConfigured: true, network: "testnet", encPubkey: "" };
}

export async function handleVisitorStatus(request: Request, deps?: { now?: number; secret?: string; configured?: boolean; demoPatient?: string }): Promise<Response> {
  const now = deps?.now ?? Date.now();
  const secret = deps?.secret !== undefined ? deps.secret : (process.env.DEMO_SESSION_SECRET ?? "");
  const configured = deps?.configured ?? faucetConfigured();
  const demoPatient = deps?.demoPatient ?? publicDemoConfig()?.accounts.patient ?? "";
  const headers = new Headers({ "cache-control": "no-store" });
  const session = secret ? readVisitorSession(request.headers.get("cookie"), secret, now) : null;
  if (session && secret) {
    const secure = new URL(request.url).protocol === "https:";
    headers.set("set-cookie", writeVisitorCookie(session, secret, secure));
  }
  const body = statusFor(session?.patient ?? "", session?.patientMode ?? "", session?.encPubkey ?? "", configured, demoPatient);
  return Response.json(body, { headers });
}
