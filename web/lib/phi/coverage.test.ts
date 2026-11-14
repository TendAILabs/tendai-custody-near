import assert from "node:assert/strict";
import { test } from "node:test";
import { collectIds, collectPages, IncompleteCoverage } from "./coverage.ts";

test("pages continue past a fixed first page and fail when a later page errors", async () => {
  const actors = Array.from({ length: 60 }, (_, index) => ({ id: index + 1 }));
  const seen = await collectPages({
    limit: 50,
    maxPages: 10,
    label: "actors",
    load: async (from, limit) => actors.slice(from, from + limit),
  });
  assert.equal(seen.length, 60);
  await assert.rejects(
    () =>
      collectPages({
        limit: 50,
        maxPages: 10,
        label: "actors",
        load: async (from) => {
          if (from > 0) throw new Error("rpc down");
          return actors.slice(0, 50);
        },
      }),
    (error: unknown) => error instanceof IncompleteCoverage && /incomplete coverage/.test(error.message),
  );
});

test("record and event scans pass the old caps and a gap is not a silent end", async () => {
  const contiguous = await collectIds({
    label: "records",
    gap: 3,
    maxIds: 200,
    load: async (id) => (id <= 101 ? { id: String(id) } : null),
  });
  assert.equal(contiguous.length, 101);
  assert.equal(contiguous[100]?.id, "101");
  const gapped = await collectIds({
    label: "records",
    gap: 5,
    maxIds: 20,
    load: async (id) => (id === 1 || id === 4 ? { id: String(id) } : null),
  });
  assert.deepEqual(
    gapped.map((row) => row.id),
    ["1", "4"],
  );
  const events = Array.from({ length: 51 }, (_, index) => ({ seq: index + 1 }));
  const paged = await collectPages({
    limit: 50,
    maxPages: 10,
    label: "events",
    load: async (from, limit) => events.slice(from, from + limit),
  });
  assert.equal(paged.length, 51);
  assert.equal(paged[50]?.seq, 51);
});

test("a record read error is incomplete coverage", async () => {
  await assert.rejects(
    () =>
      collectIds({
        label: "records",
        gap: 2,
        maxIds: 10,
        load: async () => {
          throw new Error("timeout");
        },
      }),
    (error: unknown) => error instanceof IncompleteCoverage,
  );
});
