export const SUMMARY_MODEL = "z-ai/glm-5.3-flash";
export const PRIVACY_MODEL = "openai/privacy-filter";
export const SUMMARY_MAX_TOKENS = 3072;
export const DEID_MAX_TOKENS = 4096;

/**
 * Documented for z-ai/glm-5.3-flash on https://docs.near.ai/cloud/reasoning-models.md.
 * "low" and "high" are minimal reasoning, usually under 20 tokens.
 * chat_template_kwargs.enable_thinking false is documented as not shorter or faster
 * for this model, so we do not send it.
 * Completions stay non-streaming. The response-signature docs say the gateway
 * signs streamed bodies by default, and only provider_tee turns the panel green.
 */
export const GLM_REASONING_EFFORT = "low" as const;

export const TEE_STAGES = ["attesting", "encrypting", "in TEE", "verifying"] as const;
export type TeeStage = (typeof TEE_STAGES)[number];

export type TeeProgress = (event: { stage: TeeStage; chars?: number }) => void;

export type CompletionLike = {
  choices?: unknown;
};

export type ChatChunkLike = {
  id?: string;
  choices?: {
    index?: number;
    finish_reason?: unknown;
    delta?: {
      content?: unknown;
      refusal?: unknown;
      tool_calls?: unknown;
      function_call?: unknown;
      reasoning?: unknown;
      reasoning_content?: unknown;
    } | null;
    message?: {
      content?: unknown;
      refusal?: unknown;
      tool_calls?: unknown;
      function_call?: unknown;
      reasoning?: unknown;
      reasoning_content?: unknown;
    } | null;
  }[] | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
};

export type CollectedChat = {
  id?: string;
  content: string;
  finishReason: string | null;
  promptTokens: number;
  completionTokens: number;
};

const SAFE_PREFIXES = [
  "TEE de-id stopped",
  "TEE de-id did not return JSON",
  "TEE de-id JSON missing",
  "TEE de-id signatureKind",
  "TEE stream ended",
  "NEAR AI summary",
  "NEAR AI signatureKind",
  "privacy-filter HTTP",
  "Refusing ",
  "privacy-filter schema",
  "NEARAI_API_KEY",
  "Public model price",
  "No public price",
  "Spend passed",
];

export function redactEnv(message: string): string {
  let text = message;
  for (const value of Object.values(process.env)) {
    if (!value || value.length < 12) continue;
    if (text.includes(value)) text = text.split(value).join("[redacted]");
  }
  return text.replace(/ed25519:\S+/g, "ed25519:[redacted]").replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]");
}

export function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const message = redactEnv(error.message).replace(/\s+/g, " ").trim();
  const allowed = SAFE_PREFIXES.some((prefix) => message.startsWith(prefix));
  if (!allowed || message.length > 180 || /[{}`]/.test(message) || message.includes("[redacted]")) return error.name || "Error";
  return message;
}

const KNOWN_FINISH = new Set(["stop", "length", "content_filter", "tool_calls", "function_call"]);
type ContentFlag = "present" | "empty" | "non_string";
type TextLabel = "TEE de-id" | "NEAR AI summary";

/**
 * A receipt may follow only a single plain-text choice with finish_reason "stop".
 * Anything else fails closed. The error names the shape, never the model text.
 * GLM also sends a string reasoning trace beside that text. The trace is not the
 * summary: it is not returned, not logged, and not treated as the answer.
 * The field carries the answer when the summary text is missing or not a string,
 * or when the field itself is an array or object.
 * A summary is finished prose. JSON, a list, a function call, or a cut-off sentence is refused.
 * De-identification keeps its own JSON check and does not use that prose rule.
 */
export function requireAssistantText(completion: CompletionLike, label: TextLabel): string {
  const verdict = inspectCompletion(completion);
  if (!verdict.ok) throw new Error(stoppedMessage(label, verdict.reason, verdict.content));
  return verdict.text;
}

export const SUMMARY_SECTION_LABELS = ["Reason", "Findings", "Medicines"] as const;

const REFUSAL_PROSE = "i cannot provide this summary.";
const DANGLING_WORD = new Set(["a", "an", "and", "associated", "but", "for", "nor", "of", "or", "the", "to", "with"]);

export function summarySectionText(reason: string, findings: string, medicines: string): string {
  return `Reason: ${reason}\nFindings: ${findings}\nMedicines: ${medicines}`;
}

export const ACCEPTED_SUMMARY = summarySectionText(
  "Chest tightness on stairs resolves with rest.",
  "The tightness improves with rest and no new finding is added.",
  "The chart lists no current medicine.",
);

type SummaryFields = { status: "ok" | "refused"; reason: string; findings: string; medicines: string };

function refusalText(text: string): boolean {
  return text.trim().toLowerCase() === REFUSAL_PROSE;
}

function sentenceEnds(text: string): boolean {
  return /[.!?]$/.test(text);
}

function danglingSentence(text: string): boolean {
  const words = text.replace(/[.!?]+$/, "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return true;
  const last = words[words.length - 1]?.toLowerCase() ?? "";
  return DANGLING_WORD.has(last);
}

function sectionValue(line: string, label: (typeof SUMMARY_SECTION_LABELS)[number]): string | null {
  const prefix = `${label}: `;
  if (!line.startsWith(prefix)) return null;
  const value = line.slice(prefix.length).trim();
  if (!value || !sentenceEnds(value) || danglingSentence(value) || refusalText(value)) return null;
  if (/[\[\]{}`]/.test(value)) return null;
  return value;
}

function labelledSummary(text: string): string | null {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== SUMMARY_SECTION_LABELS.length) return null;
  const values: string[] = [];
  for (let index = 0; index < SUMMARY_SECTION_LABELS.length; index += 1) {
    const value = sectionValue(lines[index] ?? "", SUMMARY_SECTION_LABELS[index]);
    if (!value) return null;
    values.push(value);
  }
  return summarySectionText(values[0] ?? "", values[1] ?? "", values[2] ?? "");
}

function readSummaryEnvelope(text: string): SummaryFields | "invalid" | null {
  if (!text.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "invalid";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "invalid";
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (!keys.includes("status") || keys.some((key) => !["status", "reason", "findings", "medicines"].includes(key))) return "invalid";
  if (record.status !== "ok" && record.status !== "refused") return "invalid";
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  const findings = typeof record.findings === "string" ? record.findings.trim() : "";
  const medicines = typeof record.medicines === "string" ? record.medicines.trim() : "";
  return { status: record.status, reason, findings, medicines };
}

export function requireSummaryProse(text: string): string {
  const trimmed = text.trim();
  if (refusalText(trimmed)) throw new Error(stoppedMessage("NEAR AI summary", "refusal", "present"));
  const envelope = readSummaryEnvelope(trimmed);
  if (envelope === "invalid") throw new Error(stoppedMessage("NEAR AI summary", "schema", "present"));
  if (envelope?.status === "refused") throw new Error(stoppedMessage("NEAR AI summary", "refusal", "present"));
  const source = envelope ? summarySectionText(envelope.reason, envelope.findings, envelope.medicines) : trimmed;
  const labelled = labelledSummary(source);
  if (labelled) return labelled;
  const structure = summaryStructure(source);
  throw new Error(stoppedMessage("NEAR AI summary", structure ?? "schema", "present"));
}

function summaryStructure(text: string): "schema" | "truncated" | null {
  const trimmed = text.trim();
  if (isWrongSchema(trimmed)) return "schema";
  if (isTruncatedSummary(trimmed)) return "truncated";
  return null;
}

function isWrongSchema(text: string): boolean {
  if (/[\[\]{}`]/.test(text)) return true;
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*\([\s\S]*\)\s*$/.test(text)) return true;
  if (text.split(/\n/).some((line) => /^\s*(?:[-*]|\d+[.)])\s+/.test(line))) return true;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed !== null && typeof parsed === "object") return true;
  } catch {
    // Prose is not JSON.
  }
  return false;
}

function isTruncatedSummary(text: string): boolean {
  if (/(\.\.\.|…)\s*$/.test(text)) return true;
  if (unbalancedParens(text)) return true;
  const sentences = summarySentences(text);
  if (!sentences) return true;
  return sentences.some((sentence) => sentence.replace(/[.!?]+$/, "").trim().length < 2);
}

function summarySentences(text: string): string[] | null {
  if (!/[.!?]$/.test(text)) return null;
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length === 0 || sentences.some((sentence) => !/[.!?]$/.test(sentence))) return null;
  return sentences;
}

function unbalancedParens(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) return true;
  }
  return depth !== 0;
}

export async function collectChatStream(
  stream: AsyncIterable<ChatChunkLike>,
  onDelta?: (chars: number) => void,
  label: TextLabel = "TEE de-id",
): Promise<CollectedChat> {
  let id: string | undefined;
  let content = "";
  let finish: unknown = null;
  let sawFinish = false;
  let taintedFinish = false;
  let promptTokens = 0;
  let completionTokens = 0;
  let sawChoice = false;
  const message: Record<string, unknown> = {};
  for await (const chunk of stream) {
    if (chunk.id) id = chunk.id;
    const choices = chunk.choices;
    if (choices != null && !Array.isArray(choices)) {
      throw new Error(stoppedMessage(label, "extra_choices", "present"));
    }
    if (Array.isArray(choices) && choices.length > 1) {
      throw new Error(stoppedMessage(label, "extra_choices", "present"));
    }
    const choice = Array.isArray(choices) ? choices[0] : undefined;
    if (choice) {
      if (typeof choice.index === "number" && choice.index !== 0) {
        throw new Error(stoppedMessage(label, "extra_choices", "present"));
      }
      sawChoice = true;
      const reason = choice.finish_reason;
      if (reason != null && reason !== "") {
        sawFinish = true;
        if (!taintedFinish) finish = reason;
        if (reason !== "stop") {
          taintedFinish = true;
          finish = reason;
        }
      }
      noteChannel(message, choice.delta);
      noteChannel(message, choice.message);
      const messagePiece = choice.message && "content" in choice.message ? choice.message.content : undefined;
      if (messagePiece != null && typeof messagePiece !== "string") {
        throw new Error(stoppedMessage(label, "non_string", "non_string"));
      }
      const piece = choice.delta && "content" in choice.delta ? choice.delta.content : undefined;
      if (typeof piece === "string") {
        content += piece;
        if (piece && onDelta) onDelta(content.length);
      } else if (piece != null) {
        throw new Error(stoppedMessage(label, "non_string", "non_string"));
      }
    }
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
      completionTokens = chunk.usage.completion_tokens ?? completionTokens;
    }
  }
  const collected = requireAssistantText(
    {
      choices: sawChoice
        ? [{ finish_reason: sawFinish ? finish : null, message: { ...message, content } }]
        : [],
    },
    label,
  );
  const text = label === "NEAR AI summary" ? requireSummaryProse(collected) : collected;
  return { id, content: text, finishReason: "stop", promptTokens, completionTokens };
}

function stoppedMessage(label: TextLabel, reason: string, content: ContentFlag): string {
  return `${label} stopped before a complete answer (finish_reason=${reason}, content=${content}).`;
}

function publicFinishReason(reason: unknown): string {
  if (typeof reason !== "string" || reason.length === 0) return "missing";
  if (KNOWN_FINISH.has(reason)) return reason;
  return "unknown";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function contentKind(content: unknown): { kind: "text"; text: string } | { kind: "empty" } | { kind: "non_string" } {
  if (typeof content === "string") {
    const text = content.trim();
    return text ? { kind: "text", text } : { kind: "empty" };
  }
  if (content == null) return { kind: "empty" };
  return { kind: "non_string" };
}

function hasRefusal(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function hasToolCalls(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function hasFunctionCall(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  const record = asRecord(value);
  if (record) return Object.keys(record).length > 0;
  return true;
}

function carriesAnswer(value: unknown, contentIsAnswer: boolean): boolean {
  if (value == null) return false;
  if (typeof value === "string") return !contentIsAnswer && value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  const record = asRecord(value);
  if (record) return Object.keys(record).length > 0;
  return true;
}

type Verdict = { ok: true; text: string } | { ok: false; reason: string; content: ContentFlag };

function inspectMessage(message: Record<string, unknown> | null, finish: unknown): Verdict {
  const content = contentKind(message?.content);
  if (content.kind === "non_string") return { ok: false, reason: "non_string", content: "non_string" };
  const contentIsAnswer = content.kind === "text";
  const state: ContentFlag = contentIsAnswer ? "present" : "empty";
  const reason = publicFinishReason(finish);
  if (reason !== "stop") return { ok: false, reason, content: state };
  if (hasRefusal(message?.refusal)) return { ok: false, reason: "refusal", content: state };
  if (hasToolCalls(message?.tool_calls)) return { ok: false, reason: "tool_calls", content: state };
  if (hasFunctionCall(message?.function_call)) return { ok: false, reason: "function_call", content: state };
  if (carriesAnswer(message?.reasoning, contentIsAnswer) || carriesAnswer(message?.reasoning_content, contentIsAnswer)) {
    return { ok: false, reason: "reasoning", content: state };
  }
  if (!contentIsAnswer || content.kind !== "text") return { ok: false, reason: "stop", content: "empty" };
  return { ok: true, text: content.text };
}

function inspectCompletion(completion: CompletionLike): Verdict {
  const choices = completion.choices;
  if (choices == null || (Array.isArray(choices) && choices.length === 0)) {
    return { ok: false, reason: "missing", content: "empty" };
  }
  if (!Array.isArray(choices)) return { ok: false, reason: "unknown", content: "empty" };
  if (choices.length !== 1) return { ok: false, reason: "extra_choices", content: "present" };
  const choice = asRecord(choices[0]);
  if (!choice) return { ok: false, reason: "missing", content: "empty" };
  if (typeof choice.index === "number" && choice.index !== 0) {
    return { ok: false, reason: "extra_choices", content: "present" };
  }
  const message = asRecord(choice.message);
  return inspectMessage(
    {
      content: message?.content,
      refusal: message?.refusal ?? choice.refusal,
      tool_calls: message?.tool_calls ?? choice.tool_calls,
      function_call: message?.function_call ?? choice.function_call,
      reasoning: message?.reasoning ?? choice.reasoning,
      reasoning_content: message?.reasoning_content ?? choice.reasoning_content,
    },
    choice.finish_reason,
  );
}

function noteChannel(target: Record<string, unknown>, source: unknown): void {
  const record = asRecord(source);
  if (!record) return;
  if (hasRefusal(record.refusal)) target.refusal = "refused";
  if (hasToolCalls(record.tool_calls)) target.tool_calls = [{}];
  if (hasFunctionCall(record.function_call)) target.function_call = { name: "call" };
  noteReasoning(target, "reasoning", record.reasoning);
  noteReasoning(target, "reasoning_content", record.reasoning_content);
}

function noteReasoning(target: Record<string, unknown>, key: "reasoning" | "reasoning_content", value: unknown): void {
  if (typeof value === "string") {
    if (value.trim() && typeof target[key] !== "object") target[key] = "trace";
    return;
  }
  if (carriesAnswer(value, false)) target[key] = { carried: true };
}

export function chatBody(prompt: string, maxTokens: number) {
  return {
    model: SUMMARY_MODEL,
    messages: [{ role: "user" as const, content: prompt }],
    stream: false as const,
    max_tokens: maxTokens,
    reasoning_effort: GLM_REASONING_EFFORT,
  };
}
