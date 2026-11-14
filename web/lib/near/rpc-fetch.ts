import { rpcUrls } from "./endpoints.ts";

const TIMEOUT_MS = 8_000;
const COOLDOWN_MS = 30_000;
const downUntil = new Map<string, number>();

type RpcEnvelope = { error?: { name?: string; cause?: { name?: string }; message?: string; data?: unknown }; result?: unknown };

function transportError(payload: RpcEnvelope): boolean {
  const name = payload.error?.cause?.name ?? payload.error?.name ?? "";
  return name === "TIMEOUT_ERROR" || name === "INTERNAL_ERROR" || name === "UNAVAILABLE_SHARD" || name === "NOT_SYNCED_YET";
}

/**
 * POST one JSON-RPC request. Each provider gets one try with a timeout. A provider that fails
 * (network, timeout, 429, 5xx, bad body, node-side error) is skipped for 30 seconds and the next
 * one is tried. A contract-level error in a good response is returned as is, never retried.
 * Nothing is cached: every call reads live chain state.
 */
export async function rpcPost(body: unknown, init?: { timeoutMs?: number }): Promise<{ status: number; payload: RpcEnvelope }> {
  const urls = rpcUrls();
  const now = Date.now();
  const live = urls.filter((url) => (downUntil.get(url) ?? 0) <= now);
  const order = live.length > 0 ? [...live, ...urls.filter((url) => !live.includes(url))] : urls;
  const text = JSON.stringify(body);
  let last: { status: number; payload: RpcEnvelope } | null = null;
  let firstError: { status: number; payload: RpcEnvelope } | null = null;
  for (const url of order) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: text,
        signal: AbortSignal.timeout(init?.timeoutMs ?? TIMEOUT_MS),
      });
      const status = response.status;
      let payload: RpcEnvelope | null = null;
      try {
        payload = (await response.json()) as RpcEnvelope;
      } catch {
        payload = null;
      }
      if (status === 429 || status >= 500 || !payload || typeof payload !== "object" || transportError(payload)) {
        downUntil.set(url, Date.now() + COOLDOWN_MS);
        last = { status: status === 200 ? 502 : status, payload: payload ?? {} };
        continue;
      }
      if (payload.error) {
        // A node-side JSON-RPC error (not a contract error, which sits under result). Ask the next node,
        // and fall back to this answer when every node says the same thing.
        firstError ??= { status, payload };
        continue;
      }
      downUntil.delete(url);
      return { status, payload };
    } catch {
      downUntil.set(url, Date.now() + COOLDOWN_MS);
      last = { status: 599, payload: {} };
    }
  }
  return firstError ?? last ?? { status: 599, payload: {} };
}
