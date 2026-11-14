import { stateChangeGuard } from "../http/origin.ts";
import { safeErrorMessage } from "./completion.ts";
import {
  chargeAi,
  attemptWasSent,
  callWasNotSent,
  configuredKey,
  configuredSecret,
  refundAi,
  requireVisitor,
  UNAVAILABLE,
  type GuardOptions,
} from "./ai-guard.ts";
import type { SummaryResult } from "./summary-handler.ts";
import type { TeeProgress } from "./completion.ts";

const DEMO_CHART = "Fictional referral: exertional chest tightness for two weeks, improved with rest. No identifiers.";

export type LiveDeps = GuardOptions & {
  secret?: string;
  keyConfigured?: boolean;
  summarize?: (chart: string, progress?: TeeProgress) => Promise<SummaryResult>;
};

async function defaultSummarize(chart: string, progress?: TeeProgress): Promise<SummaryResult> {
  const { teeLiveSummary } = await import("./live.ts");
  return teeLiveSummary(chart, progress);
}

export async function handleTeeLive(request: Request, deps?: LiveDeps): Promise<Response> {
  const guarded = stateChangeGuard(request, { json: false });
  if (guarded) return guarded;
  const now = deps?.now ?? Date.now();
  const guard = { now, store: deps?.store };
  const secret = configuredSecret(deps?.secret);
  const visitor = requireVisitor(request, secret, now);
  if (!visitor.ok) return visitor.response;
  if (!configuredKey(deps?.keyConfigured)) {
    return Response.json({ error: UNAVAILABLE }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const limited = await chargeAi(request, guard);
  if (limited) return limited;
  const summarize = deps?.summarize ?? defaultSummarize;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, string | number>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const result = await summarize(DEMO_CHART, (event) => {
          send({ stage: event.stage, ...(event.chars != null ? { chars: event.chars } : {}) });
        });
        send({
          stage: "done",
          signatureKind: result.log.signatureKind,
          gatewayTcb: result.log.gatewayTcb,
          gatewaySigner: result.log.gatewaySigner ?? "",
          gatewayTls: result.log.gatewayTls ?? "",
          modelTcb: result.log.modelTcb,
          modelGpu: result.log.modelGpu ?? "",
          modelSigner: result.log.modelSigner ?? "",
          ...(result.log.gatewayTls ? { tls: result.log.gatewayTls } : {}),
          ...(result.log.modelGpu ? { gpu: result.log.modelGpu } : {}),
          ...(result.log.completionTokens != null ? { completionTokens: result.log.completionTokens } : {}),
          latencyMs: result.log.latencyMs,
          ...(result.log.summaryChars != null ? { summaryChars: result.log.summaryChars } : {}),
        });
      } catch (error) {
        if (callWasNotSent(error)) {
          if (!attemptWasSent(error)) await refundAi(request, guard);
          send({ stage: "error", message: UNAVAILABLE });
        } else {
          send({ stage: "error", message: safeErrorMessage(error) });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}
