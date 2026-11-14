import { timingSafeEqual } from "node:crypto";

export function bearerMatches(authorization: string | null, secret: string): boolean {
  if (!authorization || !secret) return false;
  const actual = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
