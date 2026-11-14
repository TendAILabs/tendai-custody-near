import { safeErrorMessage } from "../tee/completion.ts";
import { attemptWasSent } from "../tee/ai-guard.ts";
import { assertClassifierSpans } from "../tee/classifier.ts";
import { scrubText, textHasPersonalIdentifier, type Identifier } from "./scrub.ts";

export const LEAK_SCORE_THRESHOLD = 0.5;
export const DEID_NOT_JSON = "TEE de-id did not return JSON";

export type LeakSpan = {
  category: string;
  start: number;
  end: number;
  score: number;
  text?: string;
};

export type TokenUse = {
  promptTokens: number;
  completionTokens: number;
};

export type DeidModelClient = {
  deidentify(text: string): Promise<{ text: string; usage: TokenUse; receipt?: string }>;
  classify(text: string): Promise<{ spans: LeakSpan[]; usage: TokenUse }>;
};

export type DeidPipelineResult =
  | { ok: true; text: string; localOnly: boolean; usage: TokenUse[] }
  | { ok: false; reason: string; stage: "local" | "tee" | "leak-scan"; attemptSent?: boolean };

export function fixtureHits(text: string, identifiers: Identifier[]): string[] {
  const hits: string[] = [];
  for (const identifier of identifiers) {
    const value = identifier.value.trim();
    if (value.length >= 3 && text.includes(value)) hits.push(value);
  }
  return hits;
}

export function blockingSpans(spans: LeakSpan[], threshold = LEAK_SCORE_THRESHOLD): LeakSpan[] {
  return spans.filter((span) => span.score >= threshold);
}

export function parseDeidJson(content: string): string {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(DEID_NOT_JSON);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    throw new Error(DEID_NOT_JSON);
  }
  const text = parsed && typeof parsed === "object" ? (parsed as { deidentified_text?: unknown }).deidentified_text : undefined;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("TEE de-id JSON missing deidentified_text");
  }
  return text;
}

export async function runDeidPipeline(args: {
  text: string;
  identifiers: Identifier[];
  anchorDate: string;
  client: DeidModelClient | null;
}): Promise<DeidPipelineResult> {
  const local = scrubText(args.text, { identifiers: args.identifiers, anchorDate: args.anchorDate });
  const localHits = fixtureHits(local.text, args.identifiers);
  if (localHits.length > 0 || textHasPersonalIdentifier(local.text)) {
    return { ok: false, reason: "local scrub left a personal identifier", stage: "local" };
  }
  if (!args.client) {
    return { ok: false, reason: "TEE client required", stage: "tee" };
  }
  let teeText = "";
  let teeUsage: TokenUse = { promptTokens: 0, completionTokens: 0 };
  try {
    const tee = await args.client.deidentify(local.text);
    teeText = tee.text;
    teeUsage = tee.usage;
  } catch (error) {
    return {
      ok: false,
      reason: `TEE de-id failed: ${safeErrorMessage(error)}`,
      stage: "tee",
      ...(attemptWasSent(error) ? { attemptSent: true } : {}),
    };
  }
  if (fixtureHits(teeText, args.identifiers).length > 0 || textHasPersonalIdentifier(teeText)) {
    return { ok: false, reason: "TEE output still contains a personal identifier", stage: "tee" };
  }
  let spans: LeakSpan[] = [];
  let classifyUsage: TokenUse = { promptTokens: 0, completionTokens: 0 };
  try {
    const classified = await args.client.classify(teeText);
    spans = assertClassifierSpans(classified.spans, teeText.length);
    classifyUsage = classified.usage;
  } catch (error) {
    return {
      ok: false,
      reason: `privacy-filter leak scan failed: ${safeErrorMessage(error)}`,
      stage: "leak-scan",
      attemptSent: true,
    };
  }
  if (blockingSpans(spans).length > 0) {
    return { ok: false, reason: "privacy-filter span at or above 0.5", stage: "leak-scan" };
  }
  if (spans.some((span) => span.text && fixtureHits(span.text, args.identifiers).length > 0)) {
    return { ok: false, reason: "privacy-filter span contains a fixture identifier", stage: "leak-scan" };
  }
  return { ok: true, text: teeText, localOnly: false, usage: [teeUsage, classifyUsage] };
}
