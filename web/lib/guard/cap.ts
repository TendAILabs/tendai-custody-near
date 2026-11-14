const CAP_MAX = 100_000;

// Empty, zero, and non-integers keep the published default so a bad deploy value
// cannot open the limiter or store a huge stamp list.
export function configuredCap(raw: string | undefined, fallback: number): number {
  if (raw == null) return fallback;
  const text = raw.trim();
  if (!/^[1-9][0-9]*$/.test(text)) return fallback;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > CAP_MAX) return fallback;
  return value;
}
