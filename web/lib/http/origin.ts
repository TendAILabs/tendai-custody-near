// DEMO_CANONICAL_ORIGIN is the browser origin for state-changing routes and the
// NEP-413 recipient. When it is empty, the host falls back to
// VERCEL_PROJECT_PRODUCTION_URL, then VERCEL_URL, then the request's own origin.

function withScheme(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

export function canonicalOrigin(request?: Request): string {
  const explicit = process.env.DEMO_CANONICAL_ORIGIN?.trim();
  if (explicit) return withScheme(explicit);
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return withScheme(production);
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return withScheme(vercel);
  if (request) return new URL(request.url).origin;
  return "";
}

export function allowedOrigins(request: Request): Set<string> {
  const origins = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value?.trim()) return;
    origins.add(withScheme(value));
  };
  add(process.env.DEMO_CANONICAL_ORIGIN);
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  add(process.env.VERCEL_URL);
  origins.add(new URL(request.url).origin);
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0]?.trim() ?? "";
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) origins.add(`${new URL(request.url).protocol}//${host}`);
  return origins;
}

function reject(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

export function stateChangeGuard(request: Request, options?: { json?: boolean }): Response | null {
  const origin = request.headers.get("origin");
  if (origin) {
    if (!allowedOrigins(request).has(origin)) return reject(403, "bad origin");
  } else if (process.env.VERCEL || process.env.DEMO_CANONICAL_ORIGIN) {
    return reject(403, "bad origin");
  }
  if (options?.json !== false) {
    const type = (request.headers.get("content-type") ?? "").toLowerCase();
    if (!type.includes("application/json")) return reject(415, "unsupported media type");
  }
  return null;
}
