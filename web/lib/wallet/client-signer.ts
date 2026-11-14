import { browserKeyStore, type LocalDeviceKey } from "./keys.ts";
import { connectedWallet } from "./near-connect.ts";
import { broadcastLocal, type BroadcastCall } from "./patient-sign.ts";
import type { VisitorStatus } from "../visitor/status.ts";

const RPC_CONTRACT = "/api/demo/config";

async function visitorStatus(): Promise<VisitorStatus> {
  const response = await fetch("/api/visitor", { credentials: "same-origin" });
  if (!response.ok) throw new Error("visitor status failed");
  return (await response.json()) as VisitorStatus;
}

async function contractId(): Promise<string> {
  const response = await fetch(RPC_CONTRACT, { credentials: "same-origin" });
  if (!response.ok) throw new Error("demo not configured");
  const body = (await response.json()) as { contractId?: string };
  if (!body.contractId) throw new Error("demo not configured");
  return body.contractId;
}

async function serverSign(method: string, args: Record<string, unknown>): Promise<{ hash: string; value: unknown }> {
  const response = await fetch("/api/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ role: "patient", method, args }),
  });
  const body = (await response.json()) as { hash?: string; value?: unknown; error?: string };
  if (!response.ok) throw new Error(body.error ?? "sign failed");
  return { hash: body.hash ?? "", value: body.value };
}

export async function clientPatientSign(method: string, args: Record<string, unknown>, depositYocto = "1"): Promise<{ hash: string; value: unknown }> {
  const status = await visitorStatus();
  if (status.kind === "demo-server") return serverSign(method, args);
  if (status.kind === "unbound" || !status.accountId) {
    throw new Error("Create a demo key on this device, or connect a testnet wallet.");
  }
  const record = await browserKeyStore().load();
  if (!record || record.accountId !== status.accountId) throw new Error("The key for this account is not on this device.");
  const call: BroadcastCall = {
    accountId: status.accountId,
    methodName: method,
    args,
    deposit: BigInt(depositYocto),
  };
  const id = await contractId();
  if (status.kind === "local-key") {
    if (record.kind !== "local") throw new Error("The key for this account is not on this device.");
    return broadcastLocal(record, id, call);
  }
  const wallet = connectedWallet();
  if (!wallet || wallet.accountId !== status.accountId) throw new Error("Connect the testnet wallet again.");
  if (wallet.warning) throw new Error(wallet.warning);
  return wallet.signCall(id, call);
}

export async function registerDevicePatient(record: LocalDeviceKey, depositYocto: string): Promise<{ hash: string; value: unknown }> {
  const id = await contractId();
  return broadcastLocal(record, id, {
    accountId: record.accountId,
    methodName: "self_register_patient",
    args: { enc_pubkey: record.encPublicHex },
    deposit: BigInt(depositYocto),
  });
}
