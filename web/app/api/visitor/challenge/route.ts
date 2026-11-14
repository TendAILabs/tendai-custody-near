import { connection } from "next/server.js";
import { handleVisitorChallenge } from "../../../../lib/visitor/bind.ts";

// Same-origin browsers omit Origin on GET, so stateChangeGuard answers 403 when
// VERCEL or DEMO_CANONICAL_ORIGIN is set. Issuing a challenge writes the session
// cookie, so only POST is accepted. GET returns 405 and does not mint a nonce.
// Origin checks stay in stateChangeGuard. This route does not read a body.

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

type ChallengeRouteDeps = {
  ready?: () => Promise<void>;
};

async function dispatch(request: Request, context: RouteContext & Partial<ChallengeRouteDeps>): Promise<Response> {
  await (context.ready ?? connection)();
  const response = await handleVisitorChallenge(request);
  response.headers.set("cache-control", "no-store");
  return response;
}

export function GET(request: Request, context: RouteContext & Partial<ChallengeRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function POST(request: Request, context: RouteContext & Partial<ChallengeRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}
