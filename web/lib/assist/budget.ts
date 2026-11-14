import { getCache } from "@vercel/functions";
import { cacheBackedStore, memoryStore, type HitStore } from "../guard/visitor.ts";
import { ASSIST_DAY_LIMIT, ASSIST_IP_DAY_LIMIT, ASSIST_MAX_MESSAGES, ASSIST_SESSION_TTL_SECONDS } from "./limits.ts";

let sharedAssist: HitStore | null = null;

export function assistStore(override?: HitStore): HitStore {
  if (override) return override;
  if (!sharedAssist) {
    try {
      sharedAssist = cacheBackedStore(getCache({ namespace: "rr-assist" }));
    } catch {
      sharedAssist = memoryStore();
    }
  }
  return sharedAssist;
}

function countOf(value: number | number[] | null): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (Array.isArray(value)) return value.length;
  return 0;
}

export function assistDayKey(now: number): string {
  return `day:assist:${new Date(now).toISOString().slice(0, 10)}`;
}

export function assistSessionKey(sid: string): string {
  return `assist:sid:${sid}`;
}

export function assistIpKey(ip: string, now: number): string {
  return `assist:ip:${new Date(now).toISOString().slice(0, 10)}:${ip}`;
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

function ipLimit(store: HitStore): number {
  return store === sharedAssist ? ASSIST_IP_DAY_LIMIT - 1 : ASSIST_IP_DAY_LIMIT;
}

function dayTtl(now: number): number {
  const day = new Date(now).toISOString().slice(0, 10);
  const next = Date.parse(`${day}T00:00:00.000Z`) + 86_400_000;
  return Math.max(60, Math.ceil((next - now) / 1000) + 60);
}

export function nextUtcMidnight(now: number): string {
  const day = new Date(now).toISOString().slice(0, 10);
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString();
}

export async function assistDayCount(store: HitStore, now: number): Promise<number> {
  return countOf(await store.read(assistDayKey(now)));
}

export async function sessionCount(store: HitStore, sid: string): Promise<number> {
  return countOf(await store.read(assistSessionKey(sid)));
}

export async function takeAssistDay(store: HitStore, now: number): Promise<boolean> {
  return withLock(store, async () => {
    const key = assistDayKey(now);
    const count = countOf(await store.read(key));
    const limit = store === sharedAssist ? ASSIST_DAY_LIMIT - 1 : ASSIST_DAY_LIMIT;
    if (count >= limit) return false;
    await store.write(key, count + 1, dayTtl(now));
    return true;
  });
}

export async function releaseAssistDay(store: HitStore, now: number): Promise<void> {
  await withLock(store, async () => {
    const key = assistDayKey(now);
    const count = countOf(await store.read(key));
    if (count <= 0) return;
    await store.write(key, count - 1, dayTtl(now));
  });
}

export async function takeSession(store: HitStore, sid: string): Promise<boolean> {
  return withLock(store, async () => {
    const key = assistSessionKey(sid);
    const count = countOf(await store.read(key));
    if (count >= ASSIST_MAX_MESSAGES) return false;
    await store.write(key, count + 1, ASSIST_SESSION_TTL_SECONDS);
    return true;
  });
}

export async function releaseSession(store: HitStore, sid: string): Promise<void> {
  await withLock(store, async () => {
    const key = assistSessionKey(sid);
    const count = countOf(await store.read(key));
    if (count <= 0) return;
    await store.write(key, count - 1, ASSIST_SESSION_TTL_SECONDS);
  });
}

export async function takeAssistIp(store: HitStore, ip: string, now: number): Promise<boolean> {
  return withLock(store, async () => {
    const key = assistIpKey(ip, now);
    const count = countOf(await store.read(key));
    if (count >= ipLimit(store)) return false;
    await store.write(key, count + 1, dayTtl(now));
    return true;
  });
}

export async function releaseAssistIp(store: HitStore, ip: string, now: number): Promise<void> {
  await withLock(store, async () => {
    const key = assistIpKey(ip, now);
    const count = countOf(await store.read(key));
    if (count <= 0) return;
    await store.write(key, count - 1, dayTtl(now));
  });
}
