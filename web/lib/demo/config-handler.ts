import { publicDemoConfig, type PublicDemoConfig } from "./config.ts";
import { admitDemoConfig, demoConfigBuckets, demoConfigClientAddress } from "./config-limit.ts";
import { readVisitorSession, writeVisitorCookie } from "../session/visitor.ts";

export type DemoConfigDeps = {
  now?: number;
  buckets?: Map<string, number[]>;
  config?: PublicDemoConfig | null;
  secret?: string;
};

export async function handleDemoConfig(request: Request, deps?: DemoConfigDeps): Promise<Response> {
  const started = performance.now();
  const now = deps?.now ?? Date.now();
  const buckets = deps?.buckets ?? demoConfigBuckets();
  const log = (status: number) => {
    console.log(`[demo-config] GET ${status} ${Math.round(performance.now() - started)}ms`);
  };
  if (!admitDemoConfig(demoConfigClientAddress(request), now, buckets)) {
    log(429);
    return Response.json({ error: "rate limit" }, { status: 429 });
  }
  const body = deps?.config !== undefined ? deps.config : publicDemoConfig();
  if (!body) {
    log(500);
    return Response.json({ error: "demo not configured" }, { status: 500 });
  }
  const headers = new Headers({ "cache-control": "no-store" });
  const secret = deps?.secret !== undefined ? deps.secret : (process.env.DEMO_SESSION_SECRET ?? "");
  let responseBody = body;
  if (secret) {
    const current = readVisitorSession(request.headers.get("cookie"), secret, now);
    if (current?.patient && (current.patientMode === "local" || current.patientMode === "wallet" || current.patientMode === "demo")) {
      responseBody = { ...body, accounts: { ...body.accounts, patient: current.patient } };
    }
    if (current) {
      const secure = new URL(request.url).protocol === "https:";
      headers.set("set-cookie", writeVisitorCookie(current, secret, secure));
    }
  }
  log(200);
  return Response.json(responseBody, { headers });
}
