import { clientIp } from "../guard/visitor.ts";

const hits = new Map<string, number[]>();

export function openLimitKey(request: Request): string {
  return `open:${clientIp(request)}`;
}

export function allowRequest(key: string, limit = 30, windowMs = 60_000, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function resetLimits(): void {
  hits.clear();
}
