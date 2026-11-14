import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { getBlob, isSha256Hex } from "../blob/store.ts";
import { canonicalU64 } from "../ids.ts";
import { domainTag } from "../session/domain.ts";
import { COPY_UNAVAILABLE, COPY_UNAVAILABLE_MESSAGE } from "./copy.ts";
import { presentedBytes, type PresentedEnvelope } from "./present.ts";

export const OPEN_NONCE_TTL_SECONDS = 120;
const NONCE_TTL_MS = OPEN_NONCE_TTL_SECONDS * 1000;

export type NonceRedis = {
  set(key: string, value: string, opts: { nx: true; ex: number }): Promise<string | null>;
  del(key: string): Promise<number>;
};

export type NonceStore = {
  claim(usedKey: string): Promise<boolean>;
  release(usedKey: string): Promise<void>;
};

export function openNonceKey(usedKey: string): string {
  const env = process.env.VERCEL_ENV?.trim() || "dev";
  return `${env}:open:nonce:${domainTag()}:${usedKey}`;
}

export function redisNonceStore(redis: NonceRedis): NonceStore {
  return {
    async claim(usedKey) {
      const result = await redis.set(openNonceKey(usedKey), "1", { nx: true, ex: OPEN_NONCE_TTL_SECONDS });
      return result === "OK";
    },
    async release(usedKey) {
      await redis.del(openNonceKey(usedKey));
    },
  };
}

function memoryNonceStore(): NonceStore {
  const used = new Map<string, number>();
  return {
    claim(usedKey) {
      const now = Date.now();
      for (const [id, at] of used) {
        if (now - at > NONCE_TTL_MS) used.delete(id);
      }
      const at = used.get(usedKey);
      if (at != null && now - at <= NONCE_TTL_MS) return Promise.resolve(false);
      used.set(usedKey, now);
      return Promise.resolve(true);
    },
    release(usedKey) {
      used.delete(usedKey);
      return Promise.resolve();
    },
  };
}

let memoryNonces: NonceStore | null = null;

export function resetUsedNonces(): void {
  memoryNonces = memoryNonceStore();
}

function redisConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function defaultNonces(): NonceStore {
  if (redisConfigured()) return redisNonceStore(Redis.fromEnv());
  if (!memoryNonces) memoryNonces = memoryNonceStore();
  return memoryNonces;
}

export type OpenRequest = {
  account_id?: string;
  nonce?: string;
  share_id?: string;
  record_id?: string;
  envelopes?: PresentedEnvelope[];
};

export type OpenDeps = {
  checkTicket: (args: { kind: "share" | "record"; id: string; accountId: string; nonceHash: string }) => Promise<boolean>;
  effectiveStatus: (args: { kind: "share" | "record"; id: string }) => Promise<string | null>;
  blobHashes: (args: { kind: "share" | "record"; id: string }) => Promise<string[]>;
  readBlob?: (hash: string) => Promise<Uint8Array | null>;
  nonces?: NonceStore;
};

export function decideOpen(input: {
  nonceUsed: boolean;
  ticketValid: boolean;
  effectiveStatus: string | null;
}): { status: number; reason: "ok" | "replay" | "revoked" | "expired" | "no-ticket" } {
  if (input.nonceUsed) return { status: 403, reason: "replay" };
  if (input.effectiveStatus === "Revoked") return { status: 403, reason: "revoked" };
  if (input.effectiveStatus === "Expired") return { status: 403, reason: "expired" };
  if (input.ticketValid && input.effectiveStatus === "Active") return { status: 200, reason: "ok" };
  return { status: 403, reason: "no-ticket" };
}

function chosenId(body: OpenRequest): { kind: "share" | "record"; id: string } | null {
  if ((body.share_id != null && typeof body.share_id !== "string") || (body.record_id != null && typeof body.record_id !== "string")) return null;
  const sharePresent = typeof body.share_id === "string" ? body.share_id.length > 0 : false;
  const recordPresent = typeof body.record_id === "string" ? body.record_id.length > 0 : false;
  if (sharePresent === recordPresent) return null;
  const id = canonicalU64(sharePresent ? body.share_id : body.record_id);
  if (!id) return null;
  return { kind: sharePresent ? "share" : "record", id };
}

function stringField(value: unknown): string | null {
  if (value == null) return "";
  if (typeof value !== "string") return null;
  return value;
}

export async function handleOpen(body: OpenRequest, deps: OpenDeps): Promise<Response> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const accountField = stringField(body.account_id);
  const nonceField = stringField(body.nonce);
  const shareField = stringField(body.share_id);
  const recordField = stringField(body.record_id);
  if (accountField == null || nonceField == null || shareField == null || recordField == null) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const accountId = accountField.trim();
  const nonceHex = nonceField.trim().toLowerCase();
  const chosen = chosenId(body);
  if (!accountId || !/^[0-9a-f]{64}$/.test(nonceHex) || !chosen) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const { kind, id } = chosen;
  const nonceHash = createHash("sha256").update(Buffer.from(nonceHex, "hex")).digest("hex");
  const usedKey = `${kind}:${id}:${accountId}:${nonceHash}`;
  const nonces = deps.nonces ?? defaultNonces();
  let claimed = false;
  try {
    claimed = await nonces.claim(usedKey);
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  if (!claimed) {
    return Response.json({ error: "replay" }, { status: 403 });
  }
  let keepNonce = false;
  try {
    const effectiveStatus = await deps.effectiveStatus({ kind, id });
    const ticketValid =
      effectiveStatus === "Revoked" || effectiveStatus === "Expired"
        ? false
        : await deps.checkTicket({ kind, id, accountId, nonceHash });
    const decision = decideOpen({
      nonceUsed: false,
      ticketValid,
      effectiveStatus,
    });
    if (decision.reason !== "ok") {
      keepNonce = decision.reason !== "no-ticket";
      return Response.json({ error: decision.reason }, { status: decision.status });
    }
    keepNonce = true;
    const hashes = await deps.blobHashes({ kind, id });
    const read = deps.readBlob ?? ((hash: string) => getBlob(hash));
    const envelopes = [];
    for (const hash of hashes) {
      if (!isSha256Hex(hash)) continue;
      const stored = await read(hash);
      const bytes = stored ?? presentedBytes(hash, body.envelopes);
      if (!bytes) continue;
      envelopes.push({ hash, body_base64: Buffer.from(bytes).toString("base64") });
    }
    if (envelopes.length === 0) {
      keepNonce = false;
      return Response.json({ error: COPY_UNAVAILABLE, message: COPY_UNAVAILABLE_MESSAGE }, { status: 404 });
    }
    return Response.json({ envelopes });
  } finally {
    if (!keepNonce) {
      try {
        await nonces.release(usedKey);
      } catch {
        keepNonce = true;
      }
    }
  }
}
