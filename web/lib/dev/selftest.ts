import { timingSafeEqual } from "node:crypto";
import { getCache } from "@vercel/functions";
import { cacheBackedStore, type HitStore } from "../guard/visitor.ts";
import { memoryStore } from "../guard/visitor.ts";
import { redactEnv } from "../tee/completion.ts";
import { publishCheck, runAttackChecks, type AttackCheck } from "./attack-checks.ts";

export const SELFTEST_HEADER = "x-rr-selftest";
export const SELFTEST_LIMIT = 2;
const SELFTEST_WINDOW_MS = 10 * 60 * 1000;

let shared: HitStore | null = null;

export function selftestStore(): HitStore {
  if (!shared) {
    try {
      shared = cacheBackedStore(getCache({ namespace: "rr-selftest" }));
    } catch {
      shared = memoryStore({ isolated: true });
    }
  }
  return shared;
}

export function secretEquals(header: string, secret: string): boolean {
  const left = Buffer.from(header);
  const right = Buffer.from(secret);
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}

async function takeSlot(store: HitStore, now: number, slot: string): Promise<boolean> {
  const raw = await store.read(slot);
  const stamps = (Array.isArray(raw) ? raw : []).filter((at) => now - at < SELFTEST_WINDOW_MS && at <= now);
  if (stamps.length >= SELFTEST_LIMIT) return false;
  stamps.push(now);
  await store.write(slot, stamps, SELFTEST_WINDOW_MS / 1000);
  return true;
}

export async function admitDevPost(
  request: Request,
  deps?: { now?: number; store?: HitStore; slot?: string; limitError?: string },
): Promise<{ ok: true } | { ok: false; response: Response }> {
  // Production, local development, and any unset environment stop here.
  // The empty 404 is the same for every method, so a disallowed method cannot
  // answer 405 and show that this route exists.
  if (process.env.VERCEL_ENV !== "preview") {
    return { ok: false, response: new Response(null, { status: 404, headers: { "cache-control": "no-store" } }) };
  }
  if (request.method !== "POST") {
    return {
      ok: false,
      response: new Response(null, { status: 405, headers: { "cache-control": "no-store", allow: "POST" } }),
    };
  }
  const header = request.headers.get(SELFTEST_HEADER) ?? "";
  const secret = process.env.RR_SELFTEST_TOKEN ?? "";
  if (!secret || !secretEquals(header, secret)) {
    return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } }) };
  }
  const now = deps?.now ?? Date.now();
  const store = deps?.store ?? selftestStore();
  const allowed = await takeSlot(store, now, deps?.slot ?? "selftest");
  if (!allowed) {
    return {
      ok: false,
      response: Response.json(
        { error: deps?.limitError ?? "Too many selftest calls. Try again later." },
        { status: 429, headers: { "cache-control": "no-store" } },
      ),
    };
  }
  return { ok: true };
}

export async function handleSelftest(
  request: Request,
  deps?: { run?: () => Promise<AttackCheck[]>; now?: number; store?: HitStore },
): Promise<Response> {
  const gate = await admitDevPost(request, deps);
  if (!gate.ok) return gate.response;
  try {
    const checks = deps?.run ? await deps.run() : (await runAttackChecks()).checks;
    return Response.json(
      { checks: checks.map(publishCheck) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.log(`[selftest] ${selftestFailureMessage(error)}`);
    return Response.json({ error: "selftest failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

export function selftestFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) return "selftest failed";
  const cleaned = redactEnv(error.message)
    .replace(/ed25519:\S+/g, "ed25519:[redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > 180 || /[{}`]/.test(cleaned)) return "selftest failed";
  return cleaned;
}
