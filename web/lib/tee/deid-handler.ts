import { getBlob } from "../blob/store.ts";
import { stateChangeGuard } from "../http/origin.ts";
import { sealDeidArtifact, deidReceiptHash } from "../deid/artifact.ts";
import { MAYA, SECTION_BODY } from "../fixtures.ts";
import { runDeidPipeline, type DeidModelClient, type DeidPipelineResult } from "../deid/pipeline.ts";
import { textHasPersonalIdentifier } from "../deid/scrub.ts";
import { readVisitorSession, rememberIssuedReceipt, writeVisitorCookie } from "../session/visitor.ts";
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

const IDENTIFIERS = [
  { category: "name", value: MAYA.name },
  { category: "dob", value: MAYA.dob },
  { category: "mrn", value: MAYA.mrn },
  { category: "address", value: MAYA.address },
  { category: "phone", value: MAYA.phone },
  { category: "insurance", value: MAYA.insurer },
];

function beforeText(): string {
  return `${MAYA.name} born ${MAYA.dob}, MRN ${MAYA.mrn}, ${MAYA.address}, ${MAYA.phone}, ${MAYA.insurer}. ${SECTION_BODY.history} ${SECTION_BODY.labs}`;
}

export type DeidDeps = GuardOptions & {
  secret?: string;
  keyConfigured?: boolean;
  client?: DeidModelClient;
  createClient?: () => DeidModelClient;
  run?: (args: {
    text: string;
    identifiers: typeof IDENTIFIERS;
    anchorDate: string;
    client: DeidModelClient | null;
  }) => Promise<DeidPipelineResult>;
};

function failed(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });
}

async function defaultClient(): Promise<DeidModelClient> {
  const { liveDeidClient } = await import("./live.ts");
  return liveDeidClient();
}

export async function handleTeeDeid(request: Request, deps?: DeidDeps): Promise<Response> {
  const started = performance.now();
  const now = deps?.now ?? Date.now();
  const guarded = stateChangeGuard(request, { json: false });
  if (guarded) {
    console.log(`[tee-deid] POST ${guarded.status} ${Math.round(performance.now() - started)}ms`);
    return guarded;
  }
  const guard = { now, store: deps?.store };
  const secret = configuredSecret(deps?.secret);
  const visitor = requireVisitor(request, secret, now, { ok: false });
  if (!visitor.ok) {
    console.log(`[tee-deid] POST ${visitor.response.status} ${Math.round(performance.now() - started)}ms`);
    return visitor.response;
  }
  if (!configuredKey(deps?.keyConfigured)) {
    console.log(`[tee-deid] POST 503 ${Math.round(performance.now() - started)}ms`);
    return failed(503, UNAVAILABLE);
  }
  const limited = await chargeAi(request, guard);
  if (limited) {
    console.log(`[tee-deid] POST 429 ${Math.round(performance.now() - started)}ms`);
    return limited;
  }
  const before = beforeText();
  const release = async () => {
    await refundAi(request, guard);
  };
  try {
    const client = deps?.client ?? (deps?.run ? null : deps?.createClient ? deps.createClient() : await defaultClient());
    const run = deps?.run ?? runDeidPipeline;
    const result = await run({ text: before, identifiers: IDENTIFIERS, anchorDate: "2026-10-14", client });
    if (!result.ok && (result.stage === "local" || (callWasNotSent(result.reason) && !result.attemptSent))) await release();
    if (!result.ok && callWasNotSent(result.reason)) {
      console.log(`[tee-deid] POST 503 ${Math.round(performance.now() - started)}ms`);
      return failed(503, UNAVAILABLE);
    }
    if (!result.ok || textHasPersonalIdentifier(result.text)) {
      console.log(`[tee-deid] POST 422 ${Math.round(performance.now() - started)}ms`);
      return Response.json(
        {
          ok: false,
          stage: result.ok ? "leak-scan" : result.stage,
          reason: result.ok ? "personal identifier remains" : result.reason,
          before,
          after: "",
        },
        { status: 422, headers: { "cache-control": "no-store" } },
      );
    }
    const fresh = readVisitorSession(request.headers.get("cookie"), secret, now) ?? visitor.session;
    const receiptHash = deidReceiptHash(result.text);
    const artifactHash = await sealDeidArtifact(result.text, receiptHash);
    const artifactBytes = await getBlob(artifactHash);
    if (!artifactBytes) {
      console.log(`[tee-deid] POST 502 ${Math.round(performance.now() - started)}ms`);
      return failed(502, "de-identification failed");
    }
    const headers = new Headers({ "cache-control": "no-store" });
    headers.set(
      "set-cookie",
      writeVisitorCookie(rememberIssuedReceipt(fresh, receiptHash, artifactHash), secret, new URL(request.url).protocol === "https:"),
    );
    console.log(`[tee-deid] POST 200 ${Math.round(performance.now() - started)}ms`);
    return Response.json(
      {
        ok: true,
        before,
        after: result.text,
        receiptHash,
        artifactHash,
        artifactBase64: Buffer.from(artifactBytes).toString("base64"),
      },
      { headers },
    );
  } catch (error) {
    if (callWasNotSent(error) && !attemptWasSent(error)) await release();
    console.log(`[tee-deid] POST 502 ${Math.round(performance.now() - started)}ms`);
    return failed(502, "de-identification failed");
  }
}
