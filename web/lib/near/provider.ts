import { JsonRpcProvider, type Provider } from "near-api-js";
import { rpcUrls } from "./endpoints.ts";

const READ_TIMEOUT_MS = 12_000;
const COOLDOWN_MS = 30_000;

/** Only transport trouble moves to the next provider. Contract, nonce and transaction errors are rethrown untouched. */
export function isTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === "number" && (cause === 408 || cause === 429 || cause >= 500)) return true;
  if ((error as { type?: string }).type === "RetriesExceeded") return true;
  if (error.name === "TimeoutError" || error.name === "AbortError" || error instanceof TypeError) return true;
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|rpc timeout/i.test(error.message);
}

const SEND_METHODS = new Set(["sendTransaction", "sendTransactionAsync", "sendTransactionUntil", "broadcastTransaction"]);

/**
 * Failover provider for the free testnet RPCs (docs.near.org/api/rpc/providers).
 *
 * near-api-js 7.4 ships FailoverRpcProvider, but it wraps every error, including InvalidNonceError
 * and contract errors, in a FailoverRpcError. Account.signAndSendTransaction retries only on
 * InvalidNonceError, and this app reads ERR_ALREADY_REGISTERED from error messages, so the wrapped
 * errors would change behaviour. This is the same idea, with the same member providers, but it
 * fails over only on transport errors (network, timeout, 408, 429, 5xx) and rethrows anything else.
 *
 * Each member keeps a short retry budget. The library default is 12 retries, about two minutes
 * per provider. A provider that fails is skipped for 30 seconds.
 */
export function nearProvider(): Provider {
  const urls = rpcUrls();
  const members = urls.map((url) => new JsonRpcProvider({ url }, { retries: 1, wait: 300, backoff: 1.5 }));
  const downUntil = new Map<number, number>();

  const call = async (name: string, args: unknown[]): Promise<unknown> => {
    const now = Date.now();
    const indexes = members.map((_, index) => index);
    const live = indexes.filter((index) => (downUntil.get(index) ?? 0) <= now);
    const order = live.length > 0 ? [...live, ...indexes.filter((index) => !live.includes(index))] : indexes;
    let lastTransport: unknown = null;
    for (const index of order) {
      const member = members[index] as unknown as Record<string, (...input: unknown[]) => Promise<unknown>>;
      try {
        const run = member[name](...args);
        const result = SEND_METHODS.has(name)
          ? await run
          : await Promise.race([
              run,
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("rpc timeout")), READ_TIMEOUT_MS)),
            ]);
        downUntil.delete(index);
        return result;
      } catch (error) {
        if (!isTransportError(error)) throw error;
        downUntil.set(index, Date.now() + COOLDOWN_MS);
        lastTransport = error;
      }
    }
    throw lastTransport ?? new Error("NEAR testnet RPC is unavailable");
  };

  return new Proxy(members[0] as object, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;
      if (typeof property !== "string" || typeof value !== "function") return value;
      return (...args: unknown[]) => call(property, args);
    },
  }) as Provider;
}
