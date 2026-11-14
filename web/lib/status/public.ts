import { rpcPost } from "../near/rpc-fetch.ts";
export type PublicStatus = {
  near: "reachable" | "down";
  tee: "configured" | "missing";
};

// F-07. Page loads call /api/status. This in-process cache collapses probes on
// one instance. The route also sends a 15 second public cache header so the
// edge can skip the function, and a cold instance does not call NEAR RPC every time.
export const STATUS_TTL_MS = 15_000;
export const STATUS_CACHE_CONTROL = "public, max-age=15, s-maxage=15, stale-while-revalidate=15";
export const STATUS_TIMEOUT_MS = 1_500;

type StatusCache = {
  get(): Promise<PublicStatus | null>;
  set(value: PublicStatus, ttlMs: number): Promise<void>;
};

let memoryInflight: Promise<PublicStatus> | null = null;

export function memoryStatusCache(now: () => number = Date.now): StatusCache {
  const rows = new Map<string, { value: PublicStatus; exp: number }>();
  return {
    async get() {
      const row = rows.get("status");
      if (!row || row.exp <= now()) return null;
      return row.value;
    },
    async set(value, ttlMs) {
      rows.set("status", { value, exp: now() + ttlMs });
    },
  };
}

const defaultCache = memoryStatusCache();

export async function readPublicStatus(input?: {
  now?: number;
  ttlMs?: number;
  timeoutMs?: number;
  probe?: (signal: AbortSignal) => Promise<PublicStatus>;
  cache?: StatusCache;
  inflight?: { current: Promise<PublicStatus> | null };
}): Promise<PublicStatus> {
  const ttlMs = input?.ttlMs ?? STATUS_TTL_MS;
  const timeoutMs = input?.timeoutMs ?? STATUS_TIMEOUT_MS;
  const cache = input?.cache ?? defaultCache;
  const slot = input?.inflight ?? { current: memoryInflight };
  if (!input?.inflight && memoryInflight) return memoryInflight;
  if (slot.current) return slot.current;
  const probe = input?.probe ?? defaultProbe;
  const run = (async () => {
    try {
      const saved = await cache.get();
      if (saved) return saved;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const value = await new Promise<PublicStatus>((resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("timeout"));
          }, timeoutMs);
          probe(controller.signal).then(
            (row) => {
              if (timer) clearTimeout(timer);
              resolve(row);
            },
            (error: unknown) => {
              if (timer) clearTimeout(timer);
              reject(error);
            },
          );
        });
        await cache.set(value, ttlMs);
        return value;
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch {
      const down: PublicStatus = { near: "down", tee: "missing" };
      await cache.set(down, ttlMs);
      return down;
    } finally {
      slot.current = null;
      if (!input?.inflight) memoryInflight = null;
    }
  })();
  slot.current = run;
  memoryInflight = input?.inflight ? memoryInflight : run;
  return run;
}

async function defaultProbe(signal: AbortSignal): Promise<PublicStatus> {
  let near: PublicStatus["near"] = "down";
  try {
    const { status, payload } = await rpcPost({ jsonrpc: "2.0", id: "status", method: "status", params: [] }, { timeoutMs: 5_000 });
    const body = payload as { result?: { chain_id?: string } };
    if (signal.aborted) throw new Error("aborted");
    if (status === 200 && body.result?.chain_id) near = "reachable";
  } catch {
    near = "down";
  }
  let tee: PublicStatus["tee"] = "missing";
  try {
    const { requireNearAiKey } = await import("../tee/live.ts");
    requireNearAiKey();
    tee = "configured";
  } catch {
    tee = "missing";
  }
  return { near, tee };
}
