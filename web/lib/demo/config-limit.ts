import { createHash } from "node:crypto";

// One document load fetches this route once. 20 leaves room for refreshes.
// One client stops at 20 per minute. The shared cap stays 60 per minute.
export const DEMO_CONFIG_CLIENT_LIMIT = 20;
export const DEMO_CONFIG_GLOBAL_LIMIT = 60;
export const DEMO_CONFIG_WINDOW_MS = 60_000;
export const DEMO_CONFIG_GLOBAL_KEY = "demo-config";

const IP_TOKEN = /^[0-9a-fA-F:.]+$/;
const productionBuckets = new Map<string, number[]>();

function cleanIp(value: string): string | null {
  const hop = value.trim();
  if (!hop || hop.length > 64 || !IP_TOKEN.test(hop)) return null;
  return hop;
}

// Vercel sets x-real-ip to the client address. If that header is missing, the
// first x-forwarded-for hop is the same address. Off Vercel those headers are
// caller-supplied, so every caller shares "local".
export function demoConfigClientAddress(request: Request): string {
  if (!process.env.VERCEL) return "local";
  const real = cleanIp(request.headers.get("x-real-ip") ?? "");
  if (real) return real;
  const first = (request.headers.get("x-forwarded-for") ?? "").split(",")[0] ?? "";
  return cleanIp(first) ?? "unknown";
}

export function demoConfigStorageKey(address: string): string {
  const digest = createHash("sha256").update(address).digest("hex");
  return `demo-config:${digest}`;
}

export function admitDemoConfig(address: string, now = Date.now(), buckets: Map<string, number[]> = productionBuckets): boolean {
  const clientKey = demoConfigStorageKey(address);
  const client = (buckets.get(clientKey) ?? []).filter((at) => now - at < DEMO_CONFIG_WINDOW_MS && at <= now);
  const global = (buckets.get(DEMO_CONFIG_GLOBAL_KEY) ?? []).filter((at) => now - at < DEMO_CONFIG_WINDOW_MS && at <= now);
  if (client.length >= DEMO_CONFIG_CLIENT_LIMIT || global.length >= DEMO_CONFIG_GLOBAL_LIMIT) {
    if (client.length > 0) buckets.set(clientKey, client);
    buckets.set(DEMO_CONFIG_GLOBAL_KEY, global);
    return false;
  }
  client.push(now);
  global.push(now);
  buckets.set(clientKey, client);
  buckets.set(DEMO_CONFIG_GLOBAL_KEY, global);
  return true;
}

export function demoConfigBuckets(): Map<string, number[]> {
  return productionBuckets;
}
