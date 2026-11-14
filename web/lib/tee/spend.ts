import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Redis } from "@upstash/redis";

export const SPEND_STOP_USD = 4;
export const SPEND_CAP_USD = 5;
const MICRO_PER_USD = 1_000_000;
export const SPEND_STOP_MICRO = SPEND_STOP_USD * MICRO_PER_USD;
const PRICE_URL = "https://cloud-api.near.ai/v1/model/list?limit=100";

export type ModelPrice = {
  model: string;
  inputAmount: number;
  outputAmount: number;
  scale: number;
  reservedMicro?: number;
};

export type SpendCounter = {
  add(micro: number): Promise<number>;
};

export type SpendCommit = { ok: boolean; totalMicro: number };

type SpendInput = Omit<SpendCall, "at" | "usd"> & { usd: number; reservedMicro?: number };

type RedisIncr = {
  incrby(key: string, increment: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

export type SpendCall = {
  at: string;
  kind: "chat" | "privacy-classify";
  model: string;
  promptTokens: number;
  completionTokens: number;
  usd: number;
};

type Ledger = { calls: SpendCall[] };

const ROOT = import.meta.dirname
  ? path.resolve(import.meta.dirname, "../../..")
  : path.resolve(process.cwd(), "..");
const LEDGER_PATH = path.join(ROOT, "docs", "nearai-spend.md");
const SPEND_TTL_SECONDS = 60 * 60 * 24 * 400;
const SPEND_UNAVAILABLE = "Spend counter is unavailable. No request was sent.";
export const SPEND_AFTER_CALL_ERROR = "Spend counter is unavailable.";
let sharedCounter: SpendCounter | null = null;

export function usdToMicro(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  // Ceil so a fraction of a micro-USD is still counted. The tiny subtraction
  // keeps a value that is already an integer number of micros from floating up.
  const micro = Math.ceil(usd * MICRO_PER_USD - 1e-9);
  if (!Number.isSafeInteger(micro) || micro <= 0) return 0;
  return micro;
}

export function microToUsd(micro: number): number {
  if (!Number.isSafeInteger(micro) || micro <= 0) return 0;
  return micro / MICRO_PER_USD;
}

export function usdForUsage(
  price: ModelPrice,
  usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined,
  reservedMicro: number,
): { usd: number; promptTokens: number; completionTokens: number } {
  if (usage == null) return { usd: microToUsd(reservedMicro), promptTokens: 0, completionTokens: 0 };
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  return { usd: tokensToUsd(price, promptTokens, completionTokens), promptTokens, completionTokens };
}

function redisConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return Boolean(url && token);
}

export function spendCounterKey(env: NodeJS.ProcessEnv = process.env): string {
  const name = env.VERCEL_ENV?.trim() || "dev";
  return `${name}:nearai:spend-micro`;
}

function spendKey(): string {
  return spendCounterKey();
}

// One counter per process. The lock serializes the in-memory fallback. The
// yield inside the lock is what makes a missing lock drop updates under load.
export function memorySpendCounter(): SpendCounter {
  let value = 0;
  let tail: Promise<void> = Promise.resolve();
  return {
    add(micro: number) {
      const run = tail.then(async () => {
        const current = value;
        await Promise.resolve();
        value = current + micro;
        return value;
      });
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

export function counterFromRedis(redis: RedisIncr, key: string): SpendCounter {
  return {
    async add(micro: number) {
      let next: number;
      try {
        next = await redis.incrby(key, micro);
      } catch {
        throw new Error(SPEND_UNAVAILABLE);
      }
      if (!Number.isSafeInteger(next)) throw new Error(SPEND_UNAVAILABLE);
      if (micro > 0) {
        try {
          await redis.expire(key, SPEND_TTL_SECONDS);
        } catch {
          // The charge is already counted. A missing TTL leaves the stop in place.
        }
      }
      return next;
    },
  };
}

function counter(): SpendCounter {
  if (!sharedCounter) {
    sharedCounter = redisConfigured() ? counterFromRedis(Redis.fromEnv(), spendKey()) : memorySpendCounter();
  }
  return sharedCounter;
}

export async function commitSpendMicro(target: SpendCounter, micro: number, stopMicro = SPEND_STOP_MICRO): Promise<SpendCommit> {
  if (!Number.isSafeInteger(micro)) return { ok: false, totalMicro: await target.add(0) };
  if (micro === 0) return { ok: true, totalMicro: await target.add(0) };
  if (micro < 0) {
    let totalMicro = await target.add(micro);
    if (totalMicro < 0) totalMicro = await target.add(-totalMicro);
    return { ok: true, totalMicro };
  }
  const next = await target.add(micro);
  if (next > stopMicro) {
    const totalMicro = await target.add(-micro);
    return { ok: false, totalMicro };
  }
  return { ok: true, totalMicro: next };
}

async function addAfterCall(target: SpendCounter, micro: number): Promise<void> {
  try {
    const total = await target.add(micro);
    if (micro < 0 && total < 0) await target.add(-total);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("No request was sent")) throw new Error(SPEND_AFTER_CALL_ERROR);
    throw error instanceof Error ? error : new Error(SPEND_AFTER_CALL_ERROR);
  }
}

export async function applySpendMicro(target: SpendCounter, actualMicro: number, reservedMicro = 0): Promise<void> {
  const actual = Number.isSafeInteger(actualMicro) && actualMicro > 0 ? actualMicro : 0;
  const reserved = Number.isSafeInteger(reservedMicro) && reservedMicro > 0 ? reservedMicro : 0;
  const delta = actual - reserved;
  if (delta === 0) return;
  // The call already ran. Keep the overage so the next reservation is refused.
  await addAfterCall(target, delta);
}

export async function releaseReservedSpend(micro: number, target?: SpendCounter): Promise<void> {
  if (!Number.isSafeInteger(micro) || micro <= 0) return;
  try {
    await commitSpendMicro(target ?? counter(), -micro);
  } catch {
    // Leave the reservation counted.
  }
}

export async function releaseUnsentReservation(sent: boolean, micro: number, target?: SpendCounter): Promise<void> {
  if (sent) return;
  await releaseReservedSpend(micro, target);
}

export function tokensToUsd(price: ModelPrice, promptTokens: number, completionTokens: number): number {
  const unit = 10 ** price.scale;
  return (promptTokens * price.inputAmount + completionTokens * price.outputAmount) / unit;
}

export function wouldPassStop(currentUsd: number, nextUsd: number, stop = SPEND_STOP_USD): boolean {
  return currentUsd + nextUsd > stop;
}

export function totalUsd(calls: SpendCall[]): number {
  return calls.reduce((sum, call) => sum + call.usd, 0);
}

export async function fetchModelPrice(model: string): Promise<ModelPrice> {
  const response = await fetch(PRICE_URL);
  if (!response.ok) throw new Error(`Public model price list returned HTTP ${response.status}. No NEAR AI call was sent.`);
  const body = (await response.json()) as {
    models?: {
      modelId?: string;
      inputCostPerToken?: { amount?: number; scale?: number };
      outputCostPerToken?: { amount?: number; scale?: number };
    }[];
  };
  const found = body.models?.find((item) => item.modelId === model);
  const input = found?.inputCostPerToken;
  const output = found?.outputCostPerToken;
  if (!found || input?.amount == null || input.scale == null || output?.amount == null) {
    throw new Error(`No public price for ${model}. Refusing the call rather than guessing a rate.`);
  }
  return { model, inputAmount: input.amount, outputAmount: output.amount, scale: input.scale };
}

export async function readLedger(file = LEDGER_PATH): Promise<Ledger> {
  const text = await readFile(/* turbopackIgnore: true */ file, "utf8").catch(() => "");
  const match = text.match(/```json\n([\s\S]*?)\n```/);
  if (!match) return { calls: [] };
  const parsed = JSON.parse(match[1]) as Ledger;
  return { calls: Array.isArray(parsed.calls) ? parsed.calls : [] };
}

export function renderLedger(calls: SpendCall[]): string {
  const total = totalUsd(calls);
  const chatCalls = calls.filter((call) => call.kind === "chat").length;
  const rows = calls.length
    ? calls
        .map(
          (call) =>
            `| ${call.at} | ${call.kind} | ${call.model} | ${call.promptTokens} | ${call.completionTokens} | ${call.usd.toFixed(8)} |`,
        )
        .join("\n")
    : "|  |  |  |  |  |  |";
  return `# NEAR AI spend

Cap $5. A call is refused when the running total plus that call's estimate would pass $4.
Prices come from public \`GET /v1/model/list\` (nano-USD, scale 9). No API key is used for that lookup.
Snapshot read 2026-11-09: \`z-ai/glm-5.3-flash\` input 80 / output 500; \`openai/privacy-filter\` input 10 / output 0.

Chat completions: ${chatCalls}
All priced calls: ${calls.length}
Running total USD: ${total.toFixed(8)}

| When (UTC) | Call | Model | Prompt tokens | Completion tokens | Est. USD |
| --- | --- | --- | --- | --- | --- |
${rows}

\`\`\`json
${JSON.stringify({ calls }, null, 2)}
\`\`\`
`;
}

export async function assertSpendAllows(
  model: string,
  promptTokens: number,
  maxCompletionTokens: number,
  file = LEDGER_PATH,
  quoted?: ModelPrice,
): Promise<ModelPrice> {
  const price = quoted ?? (await fetchModelPrice(model));
  if (price.model !== model) {
    throw new Error(`No public price for ${model}. Refusing the call rather than guessing a rate.`);
  }
  const ledger = await readLedger(file);
  const estimate = tokensToUsd(price, promptTokens, maxCompletionTokens);
  const refused = `Refusing ${model}: estimated spend would pass $4. No request was sent.`;
  if (file !== LEDGER_PATH) {
    if (wouldPassStop(totalUsd(ledger.calls), estimate)) throw new Error(refused);
    return price;
  }
  const estimateMicro = usdToMicro(estimate);
  const ledgerMicro = usdToMicro(totalUsd(ledger.calls));
  if (ledgerMicro + estimateMicro > SPEND_STOP_MICRO) throw new Error(refused);
  if (estimateMicro > 0) {
    const committed = await commitSpendMicro(counter(), estimateMicro);
    if (!committed.ok) throw new Error(refused);
  }
  return { ...price, reservedMicro: estimateMicro };
}

export async function recordSpend(call: SpendInput, file = LEDGER_PATH): Promise<void> {
  const { reservedMicro = 0, ...entry } = call;
  const ledger = await readLedger(file);
  ledger.calls.push({ ...entry, at: new Date().toISOString() });
  try {
    await writeFile(/* turbopackIgnore: true */ file, renderLedger(ledger.calls));
  } catch {
    // Serverless hosts have no writable repo ledger. The shared counter below is the stop.
  }
  if (file !== LEDGER_PATH) {
    if (totalUsd(ledger.calls) > SPEND_STOP_USD) throw new Error("Spend passed $4 after the last call. Stopping.");
    return;
  }
  await applySpendMicro(counter(), usdToMicro(entry.usd), reservedMicro);
}
