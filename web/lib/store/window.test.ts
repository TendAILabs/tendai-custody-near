import assert from "node:assert/strict";
import { test } from "node:test";
import { admitMember, uniqueMember } from "./window.ts";
import { memoryOnce } from "./once.ts";

test("unique window members keep same-millisecond admits under the limit", () => {
  const now = Date.UTC(2026, 10, 14, 8, 0, 0);
  let members: { id: string; at: number }[] = [];
  let allowed = 0;
  for (let index = 0; index < 30; index += 1) {
    const result = admitMember(members, { id: uniqueMember(now), at: now }, 24, now, 60_000);
    members = result.members;
    if (result.ok) allowed += 1;
  }
  assert.equal(allowed, 24);
  assert.equal(members.length, 24);
  assert.equal(new Set(members.map((member) => member.at)).size, 1);
  assert.equal(new Set(members.map((member) => member.id)).size, 24);
});

test("a repeated member id does not raise the window count", () => {
  const now = 1_000;
  const first = admitMember([], { id: "same", at: now }, 24, now, 60_000);
  const second = admitMember(first.members, { id: "same", at: now }, 24, now, 60_000);
  assert.equal(second.ok, true);
  assert.equal(second.members.length, 1);
});

test("one shared claim accepts a single caller", async () => {
  const store = memoryOnce(() => 1_000);
  const results = await Promise.all(Array.from({ length: 20 }, () => store.claim("receipt:1", "1", 60)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await store.claim("receipt:1", "1", 60), false);
  await store.release("receipt:1");
  assert.equal(await store.claim("receipt:1", "1", 60), true);
});
