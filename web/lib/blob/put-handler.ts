import { contentLengthOverLimit, readBodyAtMost } from "./body.ts";
import { putBlob } from "./store.ts";
import { guardRequest, type HitStore } from "../guard/visitor.ts";
import { stateChangeGuard } from "../http/origin.ts";
import { readVisitorSession } from "../session/visitor.ts";

export type BlobPutDeps = {
  now?: number;
  store?: HitStore;
  secret?: string;
  put?: (bytes: Uint8Array) => Promise<string>;
};

export async function handleBlobPut(request: Request, deps?: BlobPutDeps): Promise<Response> {
  const started = performance.now();
  const now = deps?.now ?? Date.now();
  const guarded = stateChangeGuard(request, { json: false });
  if (guarded) {
    console.log(`[blob] PUT ${guarded.status} ${Math.round(performance.now() - started)}ms`);
    return guarded;
  }
  const fail = (status: number, error: string): Response => {
    console.log(`[blob] PUT ${status} ${Math.round(performance.now() - started)}ms`);
    return Response.json({ error }, { status });
  };
  const secret = deps?.secret !== undefined ? deps.secret : (process.env.DEMO_SESSION_SECRET ?? "");
  if (!secret) return fail(500, "session not configured");
  const session = readVisitorSession(request.headers.get("cookie"), secret, now);
  if (!session) return fail(401, "sign in required");
  if (contentLengthOverLimit(request.headers.get("content-length"))) return fail(413, "rejected");
  const bytes = await readBodyAtMost(request.body);
  if (!bytes) return fail(413, "rejected");
  if (bytes.byteLength === 0) return fail(400, "rejected");
  const limited = await guardRequest(request, "sign", { store: deps?.store, now });
  if (limited) {
    console.log(`[blob] PUT 429 ${Math.round(performance.now() - started)}ms`);
    return limited;
  }
  try {
    const hash = await (deps?.put ?? putBlob)(bytes);
    console.log(`[blob] PUT 201 ${Math.round(performance.now() - started)}ms`);
    return Response.json({ hash }, { status: 201 });
  } catch {
    return fail(400, "rejected");
  }
}
