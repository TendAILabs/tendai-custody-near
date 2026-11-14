import { configuredCap } from "../guard/cap.ts";
import { memoryStore, rateStore, retryAfterSeconds, type HitStore } from "../guard/visitor.ts";
import { onceFor, redisConfigured } from "../store/once.ts";

// One store per process, same as assistStore. The lock and the local map only
// work when every call shares this object. Runtime Cache has no atomic
// increment, so two isolates can each read the same count and both admit.
// The shared store therefore stops one below the published daily cap.
let sharedFaucet: HitStore | null = null;

export function faucetStore(): HitStore {
  if (sharedFaucet) return sharedFaucet;
  sharedFaucet = redisConfigured() ? rateStore() : memoryStore();
  return sharedFaucet;
}

export function faucetFundingKey(accountId: string): string {
  return `faucet:funded:${accountId}`;
}

function dayLimitFor(store: HitStore): number {
  const cap = faucetDayLimit();
  return store.addCount ? cap : Math.max(1, cap - 1);
}

export const FAUCET_IP_LIMIT = 3;
export const FAUCET_IP_WINDOW_MS = 60 * 60 * 1000;
// Wallet sign-in reloads this challenge. The cap is per address and uses its own key.
export const CHALLENGE_IP_LIMIT = 30;
// Each funded visitor receives 0.03 NEAR. A transfer is refused while the faucet
// balance is under 0.05 NEAR, so 150 sends need about 4.52 NEAR on the faucet
// at the start of the day. 450 sends would need about 13.52 NEAR. This repo
// does not record a faucet balance that covers that larger day, so RR_FAUCET_DAY_LIMIT
// defaults to 150.
export const FAUCET_DAY_LIMIT = 150;

export function faucetDayLimit(): number {
  return configuredCap(process.env.RR_FAUCET_DAY_LIMIT, FAUCET_DAY_LIMIT);
}
export const FAUCET_TRANSFER_YOCTO = BigInt("30000000000000000000000");
export const FAUCET_FLOOR_YOCTO = BigInt("50000000000000000000000");
export const REGISTER_DEPOSIT_YOCTO = "10000000000000000000000";
export const SPONSOR_YOCTO = BigInt("20000000000000000000000");
export const SPONSOR_FLOOR_YOCTO = SPONSOR_YOCTO;

export type FaucetAdmit =
  | { ok: true }
  | { ok: false; status: 429; error: string; retryAt: string };

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function nextUtcMidnight(now: number): number {
  const day = new Date(now).toISOString().slice(0, 10);
  return Date.parse(`${day}T00:00:00.000Z`) + 86_400_000;
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

function dayCount(value: number | number[] | null): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  return 0;
}

const locks = new WeakMap<HitStore, Promise<unknown>>();

function withLock<T>(store: HitStore, run: () => Promise<T>): Promise<T> {
  const previous = locks.get(store) ?? Promise.resolve();
  const next = previous.then(run, run);
  locks.set(
    store,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

async function takeIp(store: HitStore, key: string, now: number, limit: number, windowMs: number): Promise<{ ok: true } | { ok: false; oldest: number }> {
  if (store.takeWindow) {
    const taken = await store.takeWindow(key, now, limit, windowMs, windowMs / 1000);
    if (!taken.ok) return { ok: false, oldest: taken.oldest };
    return { ok: true };
  }
  const raw = await store.read(key);
  const stamps = (Array.isArray(raw) ? raw : []).filter((at) => now - at < windowMs && at <= now);
  if (stamps.length >= limit) return { ok: false, oldest: Math.min(...stamps) };
  stamps.push(now);
  await store.write(key, stamps, windowMs / 1000);
  return { ok: true };
}

async function releaseIp(store: HitStore, key: string, now: number, windowMs: number): Promise<void> {
  if (store.releaseWindow) {
    await store.releaseWindow(key, now, now, windowMs, windowMs / 1000);
    return;
  }
  const raw = await store.read(key);
  const stamps = (Array.isArray(raw) ? raw : []).filter((at) => now - at < windowMs && at <= now);
  const index = stamps.lastIndexOf(now);
  if (index >= 0) stamps.splice(index, 1);
  await store.write(key, stamps, windowMs / 1000);
}

export async function admitFaucet(store: HitStore, ip: string, now: number): Promise<FaucetAdmit> {
  return withLock(store, async () => {
    const ipKey = `faucet:ip:${ip}`;
    const taken = await takeIp(store, ipKey, now, FAUCET_IP_LIMIT, FAUCET_IP_WINDOW_MS);
    if (!taken.ok) {
      const retryAt = taken.oldest + FAUCET_IP_WINDOW_MS;
      return {
        ok: false,
        status: 429,
        error: `Too many new accounts from this network. Try again after ${utcStamp(retryAt)}.`,
        retryAt: new Date(retryAt).toISOString(),
      };
    }
    const dayKey = `faucet:day:${dayOf(now)}`;
    const ttl = Math.max(60, Math.ceil((nextUtcMidnight(now) - now) / 1000) + 60);
    const used = store.addCount ? await store.addCount(dayKey, 1, ttl) : dayCount(await store.read(dayKey)) + 1;
    if (!store.addCount) await store.write(dayKey, used, ttl);
    if (used > dayLimitFor(store)) {
      if (store.addCount) await store.addCount(dayKey, -1, ttl);
      else if (used > 0) await store.write(dayKey, used - 1, ttl);
      await releaseIp(store, ipKey, now, FAUCET_IP_WINDOW_MS);
      const retryAt = nextUtcMidnight(now);
      return {
        ok: false,
        status: 429,
        error: `The demo faucet has funded its accounts for today. Try again after ${utcStamp(retryAt)}.`,
        retryAt: new Date(retryAt).toISOString(),
      };
    }
    return { ok: true };
  });
}

export async function refundFaucet(store: HitStore, ip: string, now: number): Promise<void> {
  await withLock(store, async () => {
    const dayKey = `faucet:day:${dayOf(now)}`;
    const ttl = Math.max(60, Math.ceil((nextUtcMidnight(now) - now) / 1000) + 60);
    const used = dayCount(await store.read(dayKey));
    if (used > 0) {
      if (store.addCount) await store.addCount(dayKey, -1, ttl);
      else await store.write(dayKey, used - 1, ttl);
    }
    await releaseIp(store, `faucet:ip:${ip}`, now, FAUCET_IP_WINDOW_MS);
  });
}

export async function admitChallenge(store: HitStore, ip: string, now: number): Promise<FaucetAdmit> {
  return withLock(store, async () => {
    const taken = await takeIp(store, `challenge:ip:${ip}`, now, CHALLENGE_IP_LIMIT, FAUCET_IP_WINDOW_MS);
    if (!taken.ok) {
      const retryAt = taken.oldest + FAUCET_IP_WINDOW_MS;
      return {
        ok: false,
        status: 429,
        error: `Too many sign-in attempts from this network. Try again after ${utcStamp(retryAt)}.`,
        retryAt: new Date(retryAt).toISOString(),
      };
    }
    return { ok: true };
  });
}

export async function faucetDayUsage(store: HitStore, now: number): Promise<number> {
  return withLock(store, async () => dayCount(await store.read(`faucet:day:${dayOf(now)}`)));
}

const FUNDED_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function claimFaucetAccount(store: HitStore, accountId: string): Promise<boolean> {
  try {
    return await onceFor(store).claim(faucetFundingKey(accountId), "settled", FUNDED_TTL_SECONDS);
  } catch {
    return false;
  }
}

export async function releaseFaucetAccount(store: HitStore, accountId: string): Promise<void> {
  await onceFor(store).release(faucetFundingKey(accountId));
}

// RR_DEMO_SESSION_IP_LIMIT: demo sessions per IP per hour.
export const DEMO_SESSION_IP_LIMIT = 24;

export function demoSessionIpLimit(): number {
  return configuredCap(process.env.RR_DEMO_SESSION_IP_LIMIT, DEMO_SESSION_IP_LIMIT);
}

export function limitDenied(result: Extract<FaucetAdmit, { ok: false }>, now: number): Response {
  return Response.json(
    { error: result.error, retryAt: result.retryAt },
    {
      status: 429,
      headers: {
        "cache-control": "no-store",
        "retry-after": String(retryAfterSeconds(result.retryAt, now)),
      },
    },
  );
}

export async function admitDemoSession(store: HitStore, ip: string, now: number): Promise<FaucetAdmit> {
  return withLock(store, async () => {
    const taken = await takeIp(store, `visitor:demo:${ip}`, now, demoSessionIpLimit(), FAUCET_IP_WINDOW_MS);
    if (!taken.ok) {
      const retryAt = taken.oldest + FAUCET_IP_WINDOW_MS;
      return {
        ok: false,
        status: 429,
        error: `Too many demo sessions from this network. Try again after ${utcStamp(retryAt)}.`,
        retryAt: new Date(retryAt).toISOString(),
      };
    }
    return { ok: true };
  });
}
