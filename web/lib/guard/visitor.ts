import { Redis } from "@upstash/redis";
import { getCache, ipAddress } from "@vercel/functions";
import { configuredCap } from "./cap.ts";
import { redisConfigured } from "../store/once.ts";
import { admitMember, releaseMemberAt, uniqueMember, WINDOW_ADMIT_LUA, type WindowMember } from "../store/window.ts";

// One full guided walkthrough made 8 limited calls. Reset story made none.
// RR_IP_CALL_LIMIT defaults to 48 calls of one kind per IP in 10 minutes, so six walkthroughs fit.
// RR_SIGN_DAY_LIMIT and RR_AI_DAY_LIMIT default to 900 calls per UTC day.
export const IP_LIMIT = 48;
export const IP_WINDOW_MS = 10 * 60 * 1000;
export const SIGN_DAY_LIMIT = 900;
export const AI_DAY_LIMIT = 900;

export function ipCallLimit(): number {
  return configuredCap(process.env.RR_IP_CALL_LIMIT, IP_LIMIT);
}

export function signDayLimit(): number {
  return configuredCap(process.env.RR_SIGN_DAY_LIMIT, SIGN_DAY_LIMIT);
}

export function aiDayLimit(): number {
  return configuredCap(process.env.RR_AI_DAY_LIMIT, AI_DAY_LIMIT);
}

export type GuardKind = "ai" | "sign";

function dayLimit(kind: GuardKind): number {
  return kind === "ai" ? aiDayLimit() : signDayLimit();
}

export type WindowAdmit = { ok: true; member: string } | { ok: false; oldest: number };

export type HitStore = {
  read(key: string): Promise<number | number[] | null>;
  write(key: string, value: number | number[], ttlSeconds: number): Promise<void>;
  takeWindow?(key: string, now: number, limit: number, windowMs: number, ttlSeconds: number): Promise<WindowAdmit>;
  releaseWindow?(key: string, stamp: number, clock: number, windowMs: number, ttlSeconds: number): Promise<boolean>;
  addCount?(key: string, delta: number, ttlSeconds: number): Promise<number>;
};

type Admit =
  | { ok: true }
  | { ok: false; status: 429; error: string; retryAt: string };

const memory = new Map<string, number | number[]>();

const sharedBudget = new Map<string, number | number[]>();
let sharedMemory: HitStore | null = null;

function memoryHitStore(buckets: Map<string, number | number[]>): HitStore {
  const windows = new Map<string, WindowMember[]>();
  const mirror = (key: string, members: WindowMember[]) => {
    buckets.set(key, members.map((member) => member.at));
  };
  return {
    async read(key) {
      const value = buckets.get(key);
      if (typeof value === "number") return value;
      return value ? [...value] : null;
    },
    async write(key, value) {
      buckets.set(key, typeof value === "number" ? value : [...value]);
      if (Array.isArray(value)) {
        windows.set(
          key,
          value.map((at, index) => ({ id: `${at}:${index}`, at })),
        );
      }
    },
    async takeWindow(key, now, limit, windowMs) {
      const current = windows.get(key) ?? [];
      const member = { id: uniqueMember(now), at: now };
      const result = admitMember(current, member, limit, now, windowMs);
      windows.set(key, result.members);
      mirror(key, result.members);
      if (!result.ok) return { ok: false, oldest: result.oldest };
      return { ok: true, member: member.id };
    },
    async releaseWindow(key, stamp, clock, windowMs) {
      const current = windows.get(key) ?? [];
      const next = releaseMemberAt(current, stamp, clock, windowMs);
      const removed = next.length !== pruneCount(current, clock, windowMs);
      windows.set(key, next);
      mirror(key, next);
      return removed;
    },
    async addCount(key, delta) {
      const current = dayCount(buckets.get(key) ?? null);
      const next = current + delta;
      buckets.set(key, next);
      return next;
    },
  };
}

function pruneCount(members: WindowMember[], now: number, windowMs: number): number {
  return members.filter((member) => now - member.at < windowMs && member.at <= now).length;
}

export function memoryStore(options?: { isolated?: boolean }): HitStore {
  if (!options?.isolated && sharedMemory) return sharedMemory;
  const buckets = options?.isolated ? new Map<string, number | number[]>() : sharedBudget;
  const store = memoryHitStore(buckets);
  if (!options?.isolated) sharedMemory = store;
  return store;
}

function copyHit(value: number | number[] | null): number | number[] | null {
  if (typeof value === "number") return value;
  return value ? [...value] : null;
}

function normalizeHit(value: unknown): number | number[] | null {
  let current = value;
  if (typeof current === "string") {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof current === "number" && Number.isFinite(current) && current >= 0) return Math.floor(current);
  if (!Array.isArray(current)) return null;
  return current.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function mergeHit(local: number | number[] | null, remote: number | number[] | null): number | number[] | null {
  if (local == null) return copyHit(remote);
  if (remote == null) return copyHit(local);
  if (typeof local === "number" && typeof remote === "number") return Math.max(local, remote);
  const stamps = [...(Array.isArray(local) ? local : []), ...(Array.isArray(remote) ? remote : [])];
  if (stamps.length === 0) return typeof local === "number" ? local : typeof remote === "number" ? remote : null;
  return [...new Set(stamps)].sort((left, right) => left - right);
}

// The cache `name` is the x-vercel-cache-item-name label. It must be this entry's
// own key. One shared name is the wrong label for every bucket. The Runtime Cache
// is regional and ephemeral, and a later read can miss a write. The local map is
// what this instance enforces. A second instance does not see that map. Best effort.
export function cacheBackedStore(cache: {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options?: { ttl?: number; name?: string }): Promise<void> | void;
}): HitStore {
  const local = new Map<string, number | number[]>();
  return {
    async read(key) {
      let remote: unknown = null;
      try {
        remote = await cache.get(key);
      } catch {
        remote = null;
      }
      const saved = local.get(key) ?? null;
      return mergeHit(saved, normalizeHit(remote));
    },
    async write(key, value, ttlSeconds) {
      local.set(key, typeof value === "number" ? value : [...value]);
      try {
        await cache.set(key, typeof value === "number" ? value : [...value], {
          ttl: Math.max(1, Math.ceil(ttlSeconds)),
          name: key,
        });
      } catch {
        // The local map still counts on this instance.
      }
    },
  };
}

function runtimeStore(): HitStore {
  return cacheBackedStore(getCache({ namespace: "rr-guard" }));
}

let shared: HitStore | null = null;

function memoryFallback(): HitStore {
  return memoryHitStore(memory);
}

type RedisAtomic = {
  incrby(key: string, increment: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get(key: string): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
};

function redisHitStore(redis: RedisAtomic): HitStore {
  return {
    async read(key) {
      const value = await redis.get(key);
      return normalizeHit(value);
    },
    async write(key, value, ttlSeconds) {
      const amount = typeof value === "number" ? value : 0;
      const current = dayCount(await this.read(key));
      if (amount !== current) await redis.incrby(key, amount - current);
      await redis.expire(key, Math.max(1, Math.ceil(ttlSeconds)));
    },
    async takeWindow(key, now, limit, windowMs, ttlSeconds) {
      const member = uniqueMember(now);
      const raw = await redis.eval(WINDOW_ADMIT_LUA, [key], [
        String(now),
        String(windowMs),
        String(limit),
        member,
        String(Math.max(1, Math.ceil(ttlSeconds * 1000))),
      ]);
      const row = Array.isArray(raw) ? raw : [0, now];
      const ok = Number(row[0]) === 1;
      const oldest = Number(row[1]);
      if (!ok) return { ok: false, oldest: Number.isFinite(oldest) ? oldest : now };
      return { ok: true, member };
    },
    async releaseWindow(key, stamp, clock, windowMs) {
      const raw = await redis.eval(
        `local key = KEYS[1]
local stamp = tonumber(ARGV[1])
local clock = tonumber(ARGV[2])
local window = tonumber(ARGV[3])
redis.call("ZREMRANGEBYSCORE", key, "-inf", clock - window)
local found = redis.call("ZRANGEBYSCORE", key, stamp, stamp)
if #found == 0 then return 0 end
redis.call("ZREM", key, found[#found])
return 1`,
        [key],
        [String(stamp), String(clock), String(windowMs)],
      );
      return Number(raw) === 1;
    },
    async addCount(key, delta, ttlSeconds) {
      const next = await redis.incrby(key, delta);
      if (delta > 0) await redis.expire(key, Math.max(1, Math.ceil(ttlSeconds)));
      return next;
    },
  };
}

export function rateStore(): HitStore {
  return storeFor();
}

function storeFor(override?: HitStore): HitStore {
  if (override) return override;
  if (!shared) {
    if (redisConfigured()) shared = redisHitStore(Redis.fromEnv());
    else shared = memoryFallback();
  }
  return shared;
}

const IP_TOKEN = /^[0-9a-fA-F:.]+$/;

function cleanIp(value: string): string | null {
  const hop = value.trim();
  if (!hop || hop.length > 64 || !IP_TOKEN.test(hop)) return null;
  return hop;
}

// Vercel overwrites x-forwarded-for so a caller cannot supply an external address.
// x-real-ip is that same address. ipAddress() reads it and the package describes it
// as the client IP calculated by the Vercel proxy. x-vercel-forwarded-for is the same
// list. On the preview it was often one hop, and that hop changed from request to
// request, so the rightmost hop was a new bucket every time and this limiter never
// reached 24. The key is x-real-ip. If it is missing, use the rightmost
// x-vercel-forwarded-for hop. Off Vercel those headers are client-supplied, so every
// caller shares "local". The count is best effort across instances.
export function clientIp(request: Request): string {
  if (!process.env.VERCEL) return "local";
  const real = cleanIp(ipAddress(request) ?? "");
  if (real) return real;
  const raw = request.headers.get("x-vercel-forwarded-for") ?? "";
  const hops = raw.split(",").map((part) => part.trim()).filter(Boolean);
  return cleanIp(hops[hops.length - 1] ?? "") ?? "unknown";
}

const storeLocks = new WeakMap<HitStore, Promise<unknown>>();

function withStoreLock<T>(store: HitStore, run: () => Promise<T>): Promise<T> {
  const previous = storeLocks.get(store) ?? Promise.resolve();
  const next = previous.then(run, run);
  storeLocks.set(
    store,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function dayCount(value: number | number[] | null): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (Array.isArray(value)) return value.length;
  return 0;
}

function utcStamp(ms: number): string {
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
  return `${when} UTC`;
}

function nextUtcMidnight(now: number): number {
  const day = new Date(now).toISOString().slice(0, 10);
  return Date.parse(`${day}T00:00:00.000Z`) + 86_400_000;
}

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function blocked(now: number, retryAt: number, error: string): Admit {
  return { ok: false, status: 429, error, retryAt: new Date(retryAt).toISOString() };
}

export function retryAfterSeconds(retryAt: string, now: number): number {
  const at = Date.parse(retryAt);
  if (!Number.isFinite(at)) return 1;
  return Math.max(1, Math.ceil((at - now) / 1000));
}

async function admitAtomic(store: HitStore, input: { ip: string; kind: GuardKind }, now: number): Promise<Admit> {
  const ipKey = `ip:${input.kind}:${input.ip}`;
  const ipCap = ipCallLimit();
  const taken = await store.takeWindow!(ipKey, now, ipCap, IP_WINDOW_MS, IP_WINDOW_MS / 1000);
  if (!taken.ok) {
    const retryAt = taken.oldest + IP_WINDOW_MS;
    return blocked(now, retryAt, `Too many tries from this network. Try again after ${utcStamp(retryAt)}.`);
  }
  const day = dayOf(now);
  const dayKey = `day:${input.kind}:${day}`;
  const refundKey = `refund:${input.kind}:${day}`;
  const ttl = Math.max(60, Math.ceil((nextUtcMidnight(now) - now) / 1000) + 60);
  const charged = await store.addCount!(dayKey, 1, ttl);
  const refunded = dayCount(await store.read(refundKey));
  const cap = dayLimit(input.kind);
  if (charged - refunded > cap) {
    await store.addCount!(dayKey, -1, ttl);
    await store.releaseWindow!(ipKey, now, now, IP_WINDOW_MS, IP_WINDOW_MS / 1000);
    const retryAt = nextUtcMidnight(now);
    const reason =
      input.kind === "ai"
        ? `This demo has used its NEAR AI calls for today. Try again after ${utcStamp(retryAt)}.`
        : `Too many signed calls from this demo today. Try again after ${utcStamp(retryAt)}.`;
    return blocked(now, retryAt, reason);
  }
  return { ok: true };
}

export async function admit(input: { ip: string; kind: GuardKind; now?: number; store?: HitStore }): Promise<Admit> {
  const now = input.now ?? Date.now();
  const store = storeFor(input.store);
  return withStoreLock(store, async () => {
    if (store.takeWindow && store.addCount && store.releaseWindow) return admitAtomic(store, input, now);
    const ipKey = `ip:${input.kind}:${input.ip}`;
    const ipCap = ipCallLimit();
    const ipRaw = await store.read(ipKey);
    const ipStamps = (Array.isArray(ipRaw) ? ipRaw : []).filter((at) => now - at < IP_WINDOW_MS && at <= now);
    if (ipStamps.length >= ipCap) {
      const retryAt = Math.min(...ipStamps) + IP_WINDOW_MS;
      return blocked(now, retryAt, `Too many tries from this network. Try again after ${utcStamp(retryAt)}.`);
    }
    const day = dayOf(now);
    const dayKey = `day:${input.kind}:${day}`;
    const refundKey = `refund:${input.kind}:${day}`;
    const charged = dayCount(await store.read(dayKey));
    const refunded = dayCount(await store.read(refundKey));
    // Net of releases. A higher cached charge count must not erase a release:
    // the release counter only moves up, and merge keeps the higher number.
    const count = Math.max(0, charged - refunded);
    const cap = dayLimit(input.kind);
    if (count >= cap) {
      const retryAt = nextUtcMidnight(now);
      const reason =
        input.kind === "ai"
          ? `This demo has used its NEAR AI calls for today. Try again after ${utcStamp(retryAt)}.`
          : `Too many signed calls from this demo today. Try again after ${utcStamp(retryAt)}.`;
      return blocked(now, retryAt, reason);
    }
    ipStamps.push(now);
    await store.write(ipKey, ipStamps, IP_WINDOW_MS / 1000);
    const ttl = Math.max(60, Math.ceil((nextUtcMidnight(now) - now) / 1000) + 60);
    await store.write(dayKey, charged + 1, ttl);
    return { ok: true };
  });
}

export async function refundAdmission(input: { ip: string; kind: GuardKind; now?: number; store?: HitStore }): Promise<void> {
  const now = input.now ?? Date.now();
  const store = storeFor(input.store);
  await withStoreLock(store, async () => {
    const day = dayOf(now);
    const dayKey = `day:${input.kind}:${day}`;
    const charged = dayCount(await store.read(dayKey));
    const refundKey = `refund:${input.kind}:${day}`;
    const refunded = dayCount(await store.read(refundKey));
    if (refunded >= charged) return;
    const ttl = Math.max(60, Math.ceil((nextUtcMidnight(now) - now) / 1000) + 60);
    if (store.addCount && store.releaseWindow) {
      await store.addCount(refundKey, 1, ttl);
      await store.releaseWindow(`ip:${input.kind}:${input.ip}`, now, now, IP_WINDOW_MS, IP_WINDOW_MS / 1000);
      return;
    }
    await store.write(refundKey, refunded + 1, ttl);
    const ipKey = `ip:${input.kind}:${input.ip}`;
    const ipRaw = await store.read(ipKey);
    const ipStamps = (Array.isArray(ipRaw) ? ipRaw : []).filter((at) => now - at < IP_WINDOW_MS && at <= now);
    const index = ipStamps.lastIndexOf(now);
    if (index < 0) return;
    ipStamps.splice(index, 1);
    await store.write(ipKey, ipStamps, IP_WINDOW_MS / 1000);
  });
}

export async function dayUsage(kind: GuardKind, now = Date.now(), store?: HitStore): Promise<number> {
  const chosen = storeFor(store);
  return withStoreLock(chosen, async () => {
    const day = dayOf(now);
    const charged = dayCount(await chosen.read(`day:${kind}:${day}`));
    const refunded = dayCount(await chosen.read(`refund:${kind}:${day}`));
    return Math.max(0, charged - refunded);
  });
}

export function tooMany(result: Extract<Admit, { ok: false }>, now = Date.now()): Response {
  const seconds = retryAfterSeconds(result.retryAt, now);
  return Response.json(
    { error: result.error, retryAt: result.retryAt },
    { status: 429, headers: { "retry-after": String(seconds), "cache-control": "no-store" } },
  );
}

export async function guardRequest(request: Request, kind: GuardKind, options?: { store?: HitStore; now?: number }): Promise<Response | null> {
  const result = await admit({ ip: clientIp(request), kind, now: options?.now, store: options?.store });
  if (result.ok) return null;
  return tooMany(result, options?.now ?? Date.now());
}
