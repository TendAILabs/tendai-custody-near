import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { memoryStatusCache, readPublicStatus, STATUS_CACHE_CONTROL, type PublicStatus } from "./public.ts";

test("status calls share one probe, then a short cache, and time out", async () => {
  const cache = memoryStatusCache(() => 1_000);
  const inflight = { current: null as Promise<PublicStatus> | null };
  let calls = 0;
  const probe = async (): Promise<PublicStatus> => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { near: "reachable", tee: "configured" };
  };
  const first = await Promise.all(
    Array.from({ length: 20 }, () => readPublicStatus({ probe, cache, inflight, ttlMs: 5_000 })),
  );
  assert.equal(calls, 1);
  assert.equal(first.every((row) => row.near === "reachable"), true);
  const cached = await readPublicStatus({ probe, cache, inflight: { current: null }, ttlMs: 5_000 });
  assert.equal(calls, 1);
  assert.equal(cached.tee, "configured");

  const slow = memoryStatusCache(() => 5_000);
  const timed = await readPublicStatus({
    cache: slow,
    inflight: { current: null },
    timeoutMs: 20,
    ttlMs: 10,
    probe: () => new Promise(() => undefined),
  });
  assert.deepEqual(timed, { near: "down", tee: "missing" });
});

test("F-07 the status route publishes a short public cache", () => {
  assert.match(STATUS_CACHE_CONTROL, /public/);
  assert.match(STATUS_CACHE_CONTROL, /max-age=15/);
  assert.equal(STATUS_CACHE_CONTROL.includes("no-store"), false);
  const route = readFileSync(new URL("../../app/api/status/route.ts", import.meta.url), "utf8");
  assert.match(route, /STATUS_CACHE_CONTROL/);
  assert.equal(route.includes("no-store"), false);
});
