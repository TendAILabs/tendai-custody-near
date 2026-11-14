import { textHasPersonalIdentifier } from "../deid/scrub.ts";
import { canonicalU64 } from "../ids.ts";
import { stateChangeGuard } from "../http/origin.ts";
import { canonicalSummaryHash } from "./summary-receipt.ts";
import { requireSummaryProse } from "./completion.ts";
import { SUMMARY_IDENTIFIER_ERROR, summaryFailure, summaryOutputRefused } from "./summary-error.ts";
import { issueSummaryReceipt, readVisitorSession, writeVisitorCookie } from "../session/visitor.ts";
import {
  chargeAi,
  attemptWasSent,
  callWasNotSent,
  configuredKey,
  configuredSecret,
  deny,
  refundAi,
  requireVisitor,
  UNAVAILABLE,
  type GuardOptions,
} from "./ai-guard.ts";

export type SummaryResult = {
  text: string;
  log: {
    signatureKind: string;
    signer: string;
    gatewayTcb: string;
    gatewaySigner?: string;
    gatewayTls?: string;
    modelTcb: string;
    modelGpu?: string;
    modelSigner?: string;
    receiptJson: string;
    latencyMs: number;
    completionTokens?: number;
    summaryChars?: number;
  };
};

export type SummaryDeps = GuardOptions & {
  secret?: string;
  keyConfigured?: boolean;
  summarize?: (chart: string) => Promise<SummaryResult>;
};

async function defaultSummarize(chart: string): Promise<SummaryResult> {
  const { teeSummary } = await import("./live.ts");
  return teeSummary(chart);
}

function readSummaryBody(parsed: unknown): { ok: true; chart: string; shareId: string } | { ok: false; error: string } {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "bad request" };
  const body = parsed as { chart?: unknown; shareId?: unknown };
  if (typeof body.chart !== "string") return { ok: false, error: "bad request" };
  const chart = body.chart.slice(0, 8000);
  if (!chart.trim()) return { ok: false, error: "empty chart" };
  const shareId = canonicalU64(body.shareId);
  if (!shareId) return { ok: false, error: "bad request" };
  return { ok: true, chart, shareId };
}

export async function handleTeeSummary(request: Request, deps?: SummaryDeps): Promise<Response> {
  const started = performance.now();
  const now = deps?.now ?? Date.now();
  const guarded = stateChangeGuard(request);
  if (guarded) {
    console.log(`[tee-summary] POST ${guarded.status} ${Math.round(performance.now() - started)}ms`);
    return guarded;
  }
  const guard = { now, store: deps?.store };
  const secret = configuredSecret(deps?.secret);
  const visitor = requireVisitor(request, secret, now);
  if (!visitor.ok) {
    console.log(`[tee-summary] POST ${visitor.response.status} ${Math.round(performance.now() - started)}ms`);
    return visitor.response;
  }
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    parsed = null;
  }
  const body = parsed === null ? ({ ok: false, error: "bad request" } as const) : readSummaryBody(parsed);
  if (!body.ok) {
    console.log(`[tee-summary] POST 400 ${Math.round(performance.now() - started)}ms`);
    return deny(400, body.error);
  }
  if (!body.shareId || !visitor.session.shares.includes(body.shareId)) {
    console.log(`[tee-summary] POST 403 ${Math.round(performance.now() - started)}ms`);
    return deny(403, "not this session");
  }
  if (!configuredKey(deps?.keyConfigured)) {
    console.log(`[tee-summary] POST 503 ${Math.round(performance.now() - started)}ms`);
    return deny(503, UNAVAILABLE);
  }
  const limited = await chargeAi(request, guard);
  if (limited) {
    console.log(`[tee-summary] POST 429 ${Math.round(performance.now() - started)}ms`);
    return limited;
  }
  const summarize = deps?.summarize ?? defaultSummarize;
  try {
    const result = await summarize(body.chart);
    result.text = requireSummaryProse(result.text);
    // teeSummary may regenerate once. This check still refuses a kept identifier.
    if (textHasPersonalIdentifier(result.text)) {
      console.log(`[tee-summary] POST 422 ${Math.round(performance.now() - started)}ms`);
      return deny(422, SUMMARY_IDENTIFIER_ERROR);
    }
    const fresh = readVisitorSession(request.headers.get("cookie"), secret, now) ?? visitor.session;
    if (!fresh.shares.includes(body.shareId)) {
      console.log(`[tee-summary] POST 403 ${Math.round(performance.now() - started)}ms`);
      return deny(403, "not this session");
    }
    const summaryHash = canonicalSummaryHash(result.log.receiptJson);
    const issued = issueSummaryReceipt(fresh, body.shareId, summaryHash, now);
    if (!issued) {
      console.log(`[tee-summary] POST 409 ${Math.round(performance.now() - started)}ms`);
      return Response.json(
        { error: "This summary receipt was already used. Run the summary again." },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }
    const headers = new Headers({ "cache-control": "no-store" });
    headers.set("set-cookie", writeVisitorCookie(fresh, secret, new URL(request.url).protocol === "https:"));
    console.log(`[tee-summary] POST 200 ${Math.round(performance.now() - started)}ms`);
    return Response.json(
      {
        text: result.text,
        signatureKind: result.log.signatureKind,
        signer: result.log.signer,
        gatewayTcb: result.log.gatewayTcb,
        gatewaySigner: result.log.gatewaySigner ?? "",
        gatewayTls: result.log.gatewayTls ?? "",
        modelTcb: result.log.modelTcb,
        modelGpu: result.log.modelGpu ?? "",
        modelSigner: result.log.modelSigner ?? "",
        receiptJson: result.log.receiptJson,
        receiptHash: issued.receipt,
        latencyMs: result.log.latencyMs,
      },
      { headers },
    );
  } catch (error) {
    if (summaryOutputRefused(error)) {
      console.log(`[tee-summary] POST 422 ${Math.round(performance.now() - started)}ms`);
      return deny(422, SUMMARY_IDENTIFIER_ERROR);
    }
    if (callWasNotSent(error) && !attemptWasSent(error)) await refundAi(request, guard);
    const failure = summaryFailure(error);
    console.log(`${failure.log} ${Math.round(performance.now() - started)}ms`);
    return Response.json(failure.body, { status: failure.status, headers: { "cache-control": "no-store" } });
  }
}
