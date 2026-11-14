import { TESTNET_CONTRACT } from "../fixtures.ts";
import { accountUrl, isAccountId } from "./explorer.ts";

const HOSTS = ["https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"];
const OK_TTL_MS = 60_000;
const FAIL_TTL_MS = 10_000;

export type KeyView = {
  publicKey: string;
  kind: "full-access" | "function-call";
  methods: string[];
  label: "upgradable" | "full access" | "function-call";
};

export type ActorDirectoryRow = {
  accountId: string;
  role: string;
  displayName: string;
  active: boolean;
  keys: KeyView[];
  keyError: string;
};

export type DirectoryOk = {
  ok: true;
  contractId: string;
  explorerUrl: string;
  codeHash: string;
  owner: string;
  contractKeys: KeyView[];
  actors: ActorDirectoryRow[];
};

export type DirectoryResult =
  | DirectoryOk
  | {
      ok: false;
      error: string;
      contractId: string;
      explorerUrl: string;
    };

type CacheEntry = { exp: number; value: DirectoryResult };

const memory = new Map<string, CacheEntry>();

const PUBLIC_KEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]+$/;
const METHOD = /^[A-Za-z0-9_]{1,64}$/;

export function contractIdFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const configured = (env.RELAY_CONTRACT_ID ?? "").trim();
  if (isAccountId(configured)) return configured;
  return TESTNET_CONTRACT;
}

function text(value: unknown, max = 80): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return "";
  return trimmed;
}

function methodsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && METHOD.test(item)).slice(0, 12);
}

export function parseKey(raw: unknown, onContract: boolean): KeyView | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { public_key?: unknown; access_key?: { permission?: unknown } };
  const publicKey = text(row.public_key, 120);
  if (!PUBLIC_KEY.test(publicKey)) return null;
  const permission = row.access_key?.permission;
  if (permission === "FullAccess") {
    return {
      publicKey,
      kind: "full-access",
      methods: [],
      label: onContract ? "upgradable" : "full access",
    };
  }
  const record = permission && typeof permission === "object" ? (permission as Record<string, unknown>) : null;
  const call = record?.FunctionCall ?? record?.function_call;
  if (!call || typeof call !== "object") return null;
  return {
    publicKey,
    kind: "function-call",
    methods: methodsOf((call as { method_names?: unknown }).method_names),
    label: "function-call",
  };
}

export function parseKeyList(raw: unknown, onContract: boolean): KeyView[] {
  const keys = raw && typeof raw === "object" ? (raw as { keys?: unknown }).keys : null;
  if (!Array.isArray(keys)) return [];
  return keys.map((key) => parseKey(key, onContract)).filter((key): key is KeyView => key !== null);
}

function parseActor(raw: unknown): Omit<ActorDirectoryRow, "keys" | "keyError"> | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const accountId = text(row.account_id, 64);
  if (!isAccountId(accountId)) return null;
  const role = text(row.role, 40);
  return {
    accountId,
    role,
    displayName: text(row.display_name, 80) || role || accountId,
    active: row.active === true,
  };
}

type Rpc = (host: string, params: Record<string, unknown>) => Promise<unknown>;

async function defaultRpc(host: string, params: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(host, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "directory", method: "query", params }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(String(response.status));
  const payload = (await response.json()) as { error?: { message?: string }; result?: unknown };
  if (payload.error?.message) throw new Error("rpc error");
  return payload.result ?? null;
}

function bytesOf(result: unknown): string {
  const row = result && typeof result === "object" ? (result as { result?: unknown; error?: unknown }) : null;
  if (!row || row.error) throw new Error("view failed");
  const bytes = Array.isArray(row.result) ? row.result : [];
  return new TextDecoder().decode(Uint8Array.from(bytes.filter((item): item is number => typeof item === "number")));
}

async function viewCall(rpc: Rpc, host: string, contractId: string, method: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await rpc(host, {
    request_type: "call_function",
    account_id: contractId,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
    finality: "final",
  });
  const textBody = bytesOf(result);
  return textBody ? (JSON.parse(textBody) as unknown) : null;
}

async function readHost(rpc: Rpc, host: string, contractId: string): Promise<DirectoryOk> {
  const [account, ownerRaw, actorsRaw, contractKeyRaw] = await Promise.all([
    rpc(host, { request_type: "view_account", finality: "final", account_id: contractId }),
    viewCall(rpc, host, contractId, "get_owner", {}),
    viewCall(rpc, host, contractId, "list_actors", { from_index: 0, limit: 50 }),
    rpc(host, { request_type: "view_access_key_list", finality: "final", account_id: contractId }),
  ]);
  const codeHash = text((account as { code_hash?: unknown } | null)?.code_hash, 128);
  const owner = text(ownerRaw, 64);
  if (!codeHash || !isAccountId(owner)) throw new Error("account view failed");
  const parsedActors = (Array.isArray(actorsRaw) ? actorsRaw : []).map(parseActor).filter((actor) => actor !== null);
  const actors = await Promise.all(
    parsedActors.map(async (actor) => {
      try {
        const keys = await rpc(host, { request_type: "view_access_key_list", finality: "final", account_id: actor.accountId });
        return { ...actor, keys: parseKeyList(keys, false), keyError: "" };
      } catch {
        return { ...actor, keys: [], keyError: "Access keys could not be read." };
      }
    }),
  );
  return {
    ok: true,
    contractId,
    explorerUrl: accountUrl(contractId),
    codeHash,
    owner,
    contractKeys: parseKeyList(contractKeyRaw, true),
    actors,
  };
}

async function readOne(
  contractId: string,
  input: {
    rpc: Rpc;
    now: number;
    cache: Map<string, CacheEntry>;
    ttlMs?: number;
    hosts: string[];
    attempts?: number;
  },
): Promise<DirectoryResult> {
  const explorerUrl = accountUrl(contractId);
  const failure = (error: string): DirectoryResult => ({ ok: false, error, contractId, explorerUrl });
  const cached = input.cache.get(contractId);
  if (cached && cached.exp > input.now) return cached.value;
  let value: DirectoryResult | null = null;
  for (const host of input.hosts) {
    for (let attempt = 0; attempt < (input.attempts ?? 2) && !value; attempt += 1) {
      try {
        value = await readHost(input.rpc, host, contractId);
      } catch {
        value = null;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    if (value) break;
  }
  if (!value) value = failure("The contract could not be read. Try again in a moment.");
  const ttl = value.ok ? (input.ttlMs ?? OK_TTL_MS) : FAIL_TTL_MS;
  input.cache.set(contractId, { exp: input.now + ttl, value });
  return value;
}

export async function readContractDirectory(input?: {
  rpc?: Rpc;
  now?: number;
  contractId?: string;
  cache?: Map<string, CacheEntry>;
  ttlMs?: number;
  hosts?: string[];
}): Promise<DirectoryResult> {
  const preferred = input?.contractId ?? contractIdFromEnv();
  const firstId = isAccountId(preferred) ? preferred : TESTNET_CONTRACT;
  const shared = {
    rpc: input?.rpc ?? defaultRpc,
    now: input?.now ?? Date.now(),
    cache: input?.cache ?? memory,
    ttlMs: input?.ttlMs,
    hosts: input?.hosts ?? HOSTS,
  };
  const first = await readOne(firstId, { ...shared, attempts: firstId === TESTNET_CONTRACT ? 2 : 1 });
  if (first.ok || firstId === TESTNET_CONTRACT) return first;
  return readOne(TESTNET_CONTRACT, { ...shared, attempts: 2 });
}
