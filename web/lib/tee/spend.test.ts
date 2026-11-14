import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  SPEND_AFTER_CALL_ERROR,
  SPEND_STOP_MICRO,
  applySpendMicro,
  commitSpendMicro,
  counterFromRedis,
  memorySpendCounter,
  recordSpend,
  releaseReservedSpend,
  releaseUnsentReservation,
  renderLedger,
  tokensToUsd,
  totalUsd,
  usdForUsage,
  usdToMicro,
  wouldPassStop,
  type SpendCounter,
} from "./spend.ts";
import { callWasNotSent } from "./ai-guard.ts";

test("stop triggers when the next estimate passes $4", () => {
  assert.equal(wouldPassStop(3.9, 0.2), true);
  assert.equal(wouldPassStop(3.9, 0.05), false);
  assert.equal(wouldPassStop(0, 0.0001), false);
});

test("glm flash price converts nano-USD per token", () => {
  const usd = tokensToUsd({ model: "z-ai/glm-5.3-flash", inputAmount: 80, outputAmount: 500, scale: 9 }, 36, 282);
  assert.ok(Math.abs(usd - (36 * 80 + 282 * 500) / 1e9) < 1e-15);
});

function readTotal(counter: SpendCounter): Promise<number> {
  return counter.add(0);
}

async function assertConcurrentCharges(counter: SpendCounter, micro: number, count: number): Promise<void> {
  const results = await Promise.all(Array.from({ length: count }, () => commitSpendMicro(counter, micro)));
  const accepted = results.filter((result) => result.ok).length;
  const stored = await readTotal(counter);
  assert.equal(stored, accepted * micro);
  assert.ok(stored <= SPEND_STOP_MICRO);
  assert.ok(accepted > 0);
  assert.ok(accepted < count);
}

test("micro-USD rounds up and the stop is $4", () => {
  assert.equal(usdToMicro(4), SPEND_STOP_MICRO);
  assert.equal(usdToMicro(0.1), 100_000);
  assert.equal(usdToMicro(0), 0);
  assert.equal(usdToMicro(Number.NaN), 0);
  assert.equal(usdToMicro(0.0000011), 2);
  assert.equal(usdToMicro(0.0000004), 1);
});

test("concurrent in-memory charges cannot pass $4 or drop an update", async () => {
  const counter = memorySpendCounter();
  const small = 1_000;
  const fit = await Promise.all(Array.from({ length: 100 }, () => commitSpendMicro(counter, small)));
  assert.equal(fit.every((result) => result.ok), true);
  assert.equal(await readTotal(counter), 100 * small);
  await assertConcurrentCharges(memorySpendCounter(), 150_000, 40);
  const exact = memorySpendCounter();
  const filled = await commitSpendMicro(exact, SPEND_STOP_MICRO);
  assert.equal(filled.ok, true);
  const extra = await commitSpendMicro(exact, 1);
  assert.equal(extra.ok, false);
  assert.equal(await readTotal(exact), SPEND_STOP_MICRO);
});

test("concurrent Redis INCRBY charges refund the part that would pass $4", async () => {
  let value = 0;
  const ops: number[] = [];
  const counter = counterFromRedis(
    {
      async incrby(_key, increment) {
        value += increment;
        const next = value;
        ops.push(increment);
        await Promise.resolve();
        return next;
      },
      async expire() {
        return 1;
      },
    },
    "test:nearai:spend-micro",
  );
  await assertConcurrentCharges(counter, 150_000, 40);
  assert.equal(value, await readTotal(counter));
  assert.ok(ops.some((op) => op < 0));
  const before = value;
  const rejected = await commitSpendMicro(counter, SPEND_STOP_MICRO);
  assert.equal(rejected.ok, false);
  assert.equal(value, before);
  await releaseReservedSpend(1_000, counter);
  assert.equal(await readTotal(counter), Math.max(0, before - 1_000));
});

test("a returned call records overage past $4 and the next reservation is refused", async () => {
  const counter = memorySpendCounter();
  const reserved = 200_000;
  assert.equal((await commitSpendMicro(counter, reserved)).ok, true);
  await applySpendMicro(counter, 50_000, reserved);
  assert.equal(await readTotal(counter), 50_000);
  await applySpendMicro(counter, SPEND_STOP_MICRO + 25, 50_000);
  assert.equal(await readTotal(counter), SPEND_STOP_MICRO + 25);
  const next = await commitSpendMicro(counter, 1);
  assert.equal(next.ok, false);
  assert.equal(await readTotal(counter), SPEND_STOP_MICRO + 25);
});

test("a reservation is released only when the request was not sent", async () => {
  const kept = memorySpendCounter();
  assert.equal((await commitSpendMicro(kept, 400)).ok, true);
  await releaseUnsentReservation(true, 400, kept);
  assert.equal(await readTotal(kept), 400);
  const dropped = memorySpendCounter();
  assert.equal((await commitSpendMicro(dropped, 400)).ok, true);
  await releaseUnsentReservation(false, 400, dropped);
  assert.equal(await readTotal(dropped), 0);
});

test("missing usage keeps the reservation", async () => {
  const counter = memorySpendCounter();
  const reserved = 80_000;
  const price = { model: "z-ai/glm-5.3-flash", inputAmount: 80, outputAmount: 500, scale: 9 };
  assert.equal((await commitSpendMicro(counter, reserved)).ok, true);
  const missing = usdForUsage(price, undefined, reserved);
  await applySpendMicro(counter, usdToMicro(missing.usd), reserved);
  assert.equal(await readTotal(counter), reserved);
  const priced = usdForUsage(price, { prompt_tokens: 10, completion_tokens: 0 }, reserved);
  assert.ok(priced.usd > 0);
  assert.ok(priced.usd < missing.usd);
});

test("an after-call counter error does not say the request was not sent", async () => {
  const counter: SpendCounter = {
    async add(micro) {
      if (micro > 0) throw new Error("Spend counter is unavailable. No request was sent.");
      return 0;
    },
  };
  await assert.rejects(applySpendMicro(counter, 10, 0), (error: unknown) => {
    assert.equal(error instanceof Error, true);
    assert.equal((error as Error).message, SPEND_AFTER_CALL_ERROR);
    assert.equal(callWasNotSent(error), false);
    return true;
  });
});

test("ledger roundtrip keeps the running total", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "rr-spend-"));
  const file = path.join(directory, "nearai-spend.md");
  try {
    await recordSpend({ kind: "chat", model: "z-ai/glm-5.3-flash", promptTokens: 10, completionTokens: 20, usd: 0.00001 }, file);
    const text = await readFile(file, "utf8");
    assert.match(text, /Chat completions: 1/);
    assert.match(text, /0\.00001000/);
    const calls = JSON.parse(text.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? "{}").calls;
    assert.equal(totalUsd(calls), 0.00001);
    assert.equal(renderLedger([]).includes("Chat completions: 0"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
