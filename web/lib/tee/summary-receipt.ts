import { createHash } from "node:crypto";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) ordered[key] = sortValue(source[key]);
  return ordered;
}

export function canonicalSummaryHash(receiptJson: string): string {
  let canonical = receiptJson;
  try {
    const parsed = JSON.parse(receiptJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) canonical = JSON.stringify(sortValue(parsed));
  } catch {
    canonical = receiptJson;
  }
  return createHash("sha256").update(canonical).digest("hex");
}
