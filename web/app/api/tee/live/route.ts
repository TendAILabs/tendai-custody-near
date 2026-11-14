import { connection } from "next/server.js";
import type { HitStore } from "../../../../lib/guard/visitor.ts";
import { teeLiveSummary, type LiveTransport } from "../../../../lib/tee/live.ts";
import { handleTeeLive } from "../../../../lib/tee/live-handler.ts";
import type { ModelPrice } from "../../../../lib/tee/spend.ts";

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

export type LiveRouteDeps = {
  secret?: string;
  keyConfigured?: boolean;
  now?: number;
  store?: HitStore;
  ledger?: string;
  quoted?: ModelPrice;
  transport?: LiveTransport;
  ready?: () => Promise<void>;
};

export async function POST(request: Request, context: RouteContext & Partial<LiveRouteDeps>): Promise<Response> {
  await (context.ready ?? connection)();
  const transport = context.transport;
  return handleTeeLive(request, {
    secret: context.secret ?? process.env.DEMO_SESSION_SECRET ?? "",
    keyConfigured: context.keyConfigured ?? Boolean(process.env.NEARAI_API_KEY?.trim()),
    now: context.now,
    store: context.store,
    summarize: transport
      ? (chart, progress) =>
          teeLiveSummary(chart, progress, { ledger: context.ledger, quoted: context.quoted, transport })
      : teeLiveSummary,
  });
}
