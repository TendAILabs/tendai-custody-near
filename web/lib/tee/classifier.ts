export const CLASSIFIER_SCHEMA_ERROR = "privacy-filter schema rejected the response";

export type ClassifierSpan = {
  category: string;
  start: number;
  end: number;
  score: number;
  text?: string;
};

const CATEGORY = /^private_[a-z][a-z0-9_]{0,40}$/;

export function knownClassifierCategory(category: string): boolean {
  return CATEGORY.test(category);
}

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

function offset(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function readSpan(value: unknown, textLength: number): ClassifierSpan {
  if (!plain(value)) throw new Error(CLASSIFIER_SCHEMA_ERROR);
  const category = value.category;
  if (typeof category !== "string" || !knownClassifierCategory(category)) throw new Error(CLASSIFIER_SCHEMA_ERROR);
  const start = offset(value.start);
  const end = offset(value.end);
  const score = finiteScore(value.score);
  if (start == null || end == null || score == null) throw new Error(CLASSIFIER_SCHEMA_ERROR);
  if (end <= start || end > textLength) throw new Error(CLASSIFIER_SCHEMA_ERROR);
  const span: ClassifierSpan = { category, start, end, score };
  if (Object.hasOwn(value, "text")) {
    if (typeof value.text !== "string") throw new Error(CLASSIFIER_SCHEMA_ERROR);
    span.text = value.text;
  }
  return span;
}

/**
 * One classify call sends one input, so data must contain exactly one row.
 * A missing spans array is rejected. An empty spans array is a real zero-hit result.
 * span_count, when present, must match the array length.
 */
export function parseClassifierBody(body: unknown, textLength: number): ClassifierSpan[] {
  if (!plain(body) || !Number.isInteger(textLength) || textLength < 0) throw new Error(CLASSIFIER_SCHEMA_ERROR);
  if (!Array.isArray(body.data) || body.data.length !== 1) throw new Error(CLASSIFIER_SCHEMA_ERROR);
  const row = body.data[0];
  if (!plain(row) || !Array.isArray(row.spans)) throw new Error(CLASSIFIER_SCHEMA_ERROR);
  if (Object.hasOwn(row, "span_count")) {
    if (row.span_count !== row.spans.length) throw new Error(CLASSIFIER_SCHEMA_ERROR);
  }
  return row.spans.map((span) => readSpan(span, textLength));
}

export function assertClassifierSpans(spans: unknown, textLength: number): ClassifierSpan[] {
  if (!Array.isArray(spans)) throw new Error(CLASSIFIER_SCHEMA_ERROR);
  return parseClassifierBody({ data: [{ span_count: spans.length, spans }] }, textLength);
}
