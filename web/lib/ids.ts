const U64_MAX = BigInt("18446744073709551615");
const U64_DECIMAL = /^(0|[1-9][0-9]{0,19})$/;

/** A canonical u64 decimal. Leading zeros, signs, and other spellings are rejected. */
export function canonicalU64(value: unknown): string | null {
  if (typeof value !== "string" || !U64_DECIMAL.test(value)) return null;
  const parsed = BigInt(value);
  if (parsed > U64_MAX) return null;
  return value;
}
