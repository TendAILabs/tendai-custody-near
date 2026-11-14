import { connection } from "next/server.js";
import type { HitStore } from "../../../../lib/guard/visitor.ts";
import { teeSummary, type LiveTransport } from "../../../../lib/tee/live.ts";
import { handleTeeSummary } from "../../../../lib/tee/summary-handler.ts";
import type { ModelPrice } from "../../../../lib/tee/spend.ts";

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

export type SummaryRouteDeps = {
  secret?: string;
  keyConfigured?: boolean;
  now?: number;
  store?: HitStore;
  ledger?: string;
  quoted?: ModelPrice;
  transport?: LiveTransport;
  ready?: () => Promise<void>;
};

export async function POST(request: Request, context: RouteContext & Partial<SummaryRouteDeps>): Promise<Response> {
  await (context.ready ?? connection)();
  const transport = context.transport;
  return handleTeeSummary(request, {
    secret: context.secret ?? process.env.DEMO_SESSION_SECRET ?? "",
    keyConfigured: context.keyConfigured ?? Boolean(process.env.NEARAI_API_KEY?.trim()),
    now: context.now,
    store: context.store,
    summarize: transport
      ? (chart) => teeSummary(chart, undefined, { ledger: context.ledger, quoted: context.quoted, transport })
      : teeSummary,
  });
}
