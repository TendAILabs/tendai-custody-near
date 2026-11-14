import { connection } from "next/server.js";
import { handleAttackDemo } from "../../../../lib/dev/attack-demo.ts";
import type { AttackReport, SignerPublic } from "../../../../lib/dev/attack-checks.ts";
import type { HitStore } from "../../../../lib/guard/visitor.ts";

// Same gate as /api/dev/selftest. Outside preview every method is an empty 404.
// On preview only POST continues, and only with x-rr-selftest equal to RR_SELFTEST_TOKEN.
// The handler runs the attack-demo checks. The body is pass, fail, tx hashes, and signer public keys.

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

export type AttackDemoRouteDeps = {
  run?: () => Promise<AttackReport>;
  signers?: () => SignerPublic[];
  now?: number;
  store?: HitStore;
  ready?: () => Promise<void>;
};

async function dispatch(request: Request, deps: Partial<AttackDemoRouteDeps>): Promise<Response> {
  await (deps.ready ?? connection)();
  const started = performance.now();
  const response = await handleAttackDemo(request, deps);
  console.log(`[attack-demo] ${request.method} ${response.status} ${Math.round(performance.now() - started)}ms`);
  return response;
}

export function GET(request: Request, context: RouteContext & Partial<AttackDemoRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function POST(request: Request, context: RouteContext & Partial<AttackDemoRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function PUT(request: Request, context: RouteContext & Partial<AttackDemoRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function PATCH(request: Request, context: RouteContext & Partial<AttackDemoRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function DELETE(request: Request, context: RouteContext & Partial<AttackDemoRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function HEAD(request: Request, context: RouteContext & Partial<AttackDemoRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}

export function OPTIONS(request: Request, context: RouteContext & Partial<AttackDemoRouteDeps>): Promise<Response> {
  return dispatch(request, context);
}
