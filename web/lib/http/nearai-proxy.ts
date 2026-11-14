// The browser does not call /api/nearai. The route is not mounted. This handler
// stays so a leftover import cannot forward a body or accept the demo session
// secret as a bearer.

export type ProxyDeps = {
  now?: number;
  sessionSecret?: string;
  upstreamKey?: string;
  fetch?: typeof fetch;
};

export function handleNearAi(_req: Request, _deps?: ProxyDeps): Response {
  return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
}
