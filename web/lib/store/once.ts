import { Redis } from "@upstash/redis";

export type OnceStore = {
  claim(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  release(key: string): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
};

type Row = { value: string; exp: number };

export function memoryOnce(now: () => number = Date.now): OnceStore {
  const rows = new Map<string, Row>();
  const live = (key: string) => {
    const row = rows.get(key);
    if (!row) return null;
    if (row.exp <= now()) {
      rows.delete(key);
      return null;
    }
    return row;
  };
  return {
    async claim(key, value, ttlSeconds) {
      if (live(key)) return false;
      const ttl = Math.max(1, Math.ceil(ttlSeconds));
      rows.set(key, { value, exp: now() + ttl * 1000 });
      return true;
    },
    async release(key) {
      rows.delete(key);
    },
    async get(key) {
      return live(key)?.value ?? null;
    },
    async set(key, value, ttlSeconds) {
      const ttl = Math.max(1, Math.ceil(ttlSeconds));
      rows.set(key, { value, exp: now() + ttl * 1000 });
    },
  };
}

type RedisOnce = {
  set(key: string, value: string, opts: { nx?: true; ex: number }): Promise<string | null>;
  get(key: string): Promise<unknown>;
  del(key: string): Promise<number>;
};

export function redisOnce(redis: RedisOnce): OnceStore {
  return {
    async claim(key, value, ttlSeconds) {
      const result = await redis.set(key, value, { nx: true, ex: Math.max(1, Math.ceil(ttlSeconds)) });
      return result === "OK";
    },
    async release(key) {
      await redis.del(key);
    },
    async get(key) {
      const value = await redis.get(key);
      if (value == null) return null;
      return typeof value === "string" ? value : JSON.stringify(value);
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, { ex: Math.max(1, Math.ceil(ttlSeconds)) });
    },
  };
}

export function redisConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return Boolean(url && token);
}

let shared: OnceStore | null = null;

export function sharedOnce(env: NodeJS.ProcessEnv = process.env): OnceStore {
  if (!shared) shared = redisConfigured(env) ? redisOnce(Redis.fromEnv() as unknown as RedisOnce) : memoryOnce();
  return shared;
}

export function setSharedOnce(store: OnceStore | null): void {
  shared = store;
}

const attached = new WeakMap<object, OnceStore>();

export function onceFor(owner: object, env: NodeJS.ProcessEnv = process.env): OnceStore {
  if (redisConfigured(env)) return sharedOnce(env);
  const found = attached.get(owner);
  if (found) return found;
  const created = memoryOnce();
  attached.set(owner, created);
  return created;
}
