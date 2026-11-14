import { connection } from "next/server.js";
import type { AttackCheck } from "../../../../lib/dev/attack-checks.ts";
import { handleSelftest } from "../../../../lib/dev/selftest.ts";
import type { HitStore } from "../../../../lib/guard/visitor.ts";

// Every method is exported. Next would otherwise answer 405 for the ones that
// are missing, which shows that the route exists. Outside preview, handleSelftest
// returns 404 before any check runs. On preview, only POST continues.
// VERCEL_AUTOMATION_BYPASS_SECRET is a system env var at build and runtime, but
// x-vercel-protection-bypass is not in the request headers Vercel documents as
// readable inside a function. This route therefore compares x-rr-selftest to
// RR_SELFTEST_TOKEN. Set that name on Vercel Preview and for Cloud Agents.

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

export type SelftestRouteDeps = {
  run?: () => Promise<AttackCheck[]>;
  now?: number;
  store?: HitStore;
  ready?: () => Promise<void>;
};

async function dispatch(request: Request, deps: Partial<SelftestRouteDeps>): Promise<Response> {
  await (deps.ready ?? connection)();
  const started = performance.now();
  const response = await handleSelftest(request, deps);
  console.log(`[selftest] ${request.method} ${response.status} ${Math.round(performance.now() - started)}ms`);
  return response;
}

export function GET(request: Request, context: RouteContext & Partial<SelftestRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function POST(request: Request, context: RouteContext & Partial<SelftestRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function PUT(request: Request, context: RouteContext & Partial<SelftestRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function PATCH(request: Request, context: RouteContext & Partial<SelftestRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function DELETE(request: Request, context: RouteContext & Partial<SelftestRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function HEAD(request: Request, context: RouteContext & Partial<SelftestRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function OPTIONS(request: Request, context: RouteContext & Partial<SelftestRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}
