import { rpcPost } from "./rpc-fetch.ts";

export type ChainEvent = {
  at_ns: string;
  actor: string;
  kind: string;
  share_id: string | null;
  detail_hash: string | null;
};

export type ChainShare = {
  id: string;
  kind: string;
  to: string;
  effective_status: string;
  artifact_hash: string | null;
  open_count: number;
};

export type ChainShareFull = ChainShare & {
  record_id: string;
  parent: string | null;
  initiator: string;
  status: string;
  expires_at_ns: string | null;
  tee_receipt_hash: string | null;
  read_only: boolean;
  last_opened_ns: string | null;
  granted_sections: string[];
  created_at_ns: string | null;
  consented_at_ns: string | null;
  revoked_at_ns: string | null;
};

export type ChainActor = {
  account_id: string;
  role: string;
  display_name: string;
  active: boolean;
  enc_pubkey: string;
};

export function asId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return null;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return 0;
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function normalizeEvent(raw: unknown): ChainEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const at = asId(row.at_ns);
  const actor = asId(row.actor);
  const kind = asId(row.kind);
  if (!at || !actor || !kind) return null;
  return {
    at_ns: at,
    actor,
    kind,
    share_id: asId(row.share_id),
    detail_hash: asId(row.detail_hash),
  };
}

export function normalizeShare(raw: unknown): ChainShareFull | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = asId(row.id);
  const kind = asId(row.kind);
  const to = asId(row.to);
  if (!id || !kind || !to) return null;
  return {
    id,
    kind,
    to,
    effective_status: asId(row.effective_status) ?? "",
    artifact_hash: asId(row.artifact_hash),
    open_count: asCount(row.open_count),
    record_id: asId(row.record_id) ?? "",
    parent: asId(row.parent),
    initiator: asId(row.initiator) ?? "",
    status: asId(row.status) ?? "",
    expires_at_ns: asId(row.expires_at_ns),
    tee_receipt_hash: asId(row.tee_receipt_hash),
    read_only: asBool(row.read_only),
    last_opened_ns: asId(row.last_opened_ns),
    granted_sections: asStrings(row.granted_sections),
    created_at_ns: asId(row.created_at_ns),
    consented_at_ns: asId(row.consented_at_ns),
    revoked_at_ns: asId(row.revoked_at_ns),
  };
}

export function normalizeActor(raw: unknown): ChainActor | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const account = asId(row.account_id);
  if (!account) return null;
  return {
    account_id: account,
    role: asId(row.role) ?? "",
    display_name: asId(row.display_name) ?? "",
    active: asBool(row.active),
    enc_pubkey: asId(row.enc_pubkey) ?? "",
  };
}

type RpcPayload = {
  error?: { message?: string };
  result?: { result?: number[]; error?: string };
};

function plainRpcError(message: string): Error {
  if (message.includes("429") || /rate/i.test(message)) {
    return new Error("The testnet node asked us to slow down. Wait a moment, then reload.");
  }
  return new Error("The contract could not be read. Try again in a moment.");
}

async function rpcViewOnce<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
  const { status, payload } = (await rpcPost({
    jsonrpc: "2.0",
    id: "view",
    method: "query",
    params: {
      request_type: "call_function",
      account_id: contractId,
      method_name: method,
      args_base64: btoa(JSON.stringify(args)),
      finality: "optimistic",
    },
  })) as { status: number; payload: RpcPayload };
  if (status < 200 || status >= 300) throw plainRpcError(String(status));
  if (payload.error?.message) throw plainRpcError(payload.error.message);
  if (payload.result?.error) throw plainRpcError(payload.result.error);
  const text = new TextDecoder().decode(Uint8Array.from(payload.result?.result ?? []));
  return (text ? JSON.parse(text) : null) as T;
}

async function rpcView<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await rpcViewOnce(contractId, method, args);
  } catch (error) {
    if (error instanceof Error && error.message.includes("slow down")) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return rpcViewOnce(contractId, method, args);
    }
    throw error;
  }
}

export async function loadActors(contractId: string): Promise<ChainActor[]> {
  const raw = await rpcView<unknown>(contractId, "list_actors", { from_index: 0, limit: 50 });
  return asList(raw).map(normalizeActor).filter((actor): actor is ChainActor => actor !== null);
}

function projectEvents(record: Record<string, unknown> | null, shares: ChainShareFull[]): ChainEvent[] {
  const events: ChainEvent[] = [];
  const patient = asId(record?.patient) ?? "";
  const createdAt = asId(record?.created_at_ns);
  const createdBy = asId(record?.created_by);
  if (createdAt && createdBy) {
    events.push({ at_ns: createdAt, actor: createdBy, kind: "record_created", share_id: null, detail_hash: null });
  }
  const epochAt = asId(record?.epoch_changed_at_ns);
  for (const share of shares) {
    if (share.created_at_ns) {
      events.push({
        at_ns: share.created_at_ns,
        actor: share.initiator,
        kind: share.kind === "Reply" ? "reply_submitted" : share.kind === "Referral" ? "referral_requested" : "share_created",
        share_id: share.id,
        detail_hash: share.artifact_hash,
      });
    }
    if (share.consented_at_ns && patient) {
      events.push({
        at_ns: share.consented_at_ns,
        actor: patient,
        kind: "share_consented",
        share_id: share.id,
        detail_hash: share.artifact_hash,
      });
    }
    if (share.last_opened_ns) {
      events.push({
        at_ns: share.last_opened_ns,
        actor: share.to,
        kind: "share_opened",
        share_id: share.id,
        detail_hash: null,
      });
    }
    if (share.effective_status === "Revoked") {
      events.push({
        at_ns: share.revoked_at_ns ?? epochAt ?? share.created_at_ns ?? "0",
        actor: patient || share.initiator,
        kind: "share_revoked",
        share_id: share.id,
        detail_hash: null,
      });
    }
  }
  return events;
}

export async function loadRecord(
  contractId: string,
  recordId: string,
): Promise<{ events: ChainEvent[]; shares: ChainShareFull[] }> {
  const [record, sharesRaw] = await Promise.all([
    rpcView<Record<string, unknown> | null>(contractId, "get_record", { record_id: recordId }),
    rpcView<unknown>(contractId, "list_shares_for_record", { record_id: recordId, from_index: 0, limit: 50 }),
  ]);
  const shares = asList(sharesRaw).map(normalizeShare).filter((share): share is ChainShareFull => share !== null);
  return { events: projectEvents(record, shares), shares };
}

export async function loadCustody(contractId: string, recordId: string): Promise<{ events: ChainEvent[]; shares: ChainShare[] }> {
  const loaded = await loadRecord(contractId, recordId);
  return {
    events: loaded.events,
    shares: loaded.shares.map((share) => ({
      id: share.id,
      kind: share.kind,
      to: share.to,
      effective_status: share.effective_status,
      artifact_hash: share.artifact_hash,
      open_count: share.open_count,
    })),
  };
}

export function nsToBangkok(atNs: string): string {
  try {
    const ms = Number(BigInt(atNs) / BigInt(1000000));
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(ms));
  } catch {
    return atNs;
  }
}
