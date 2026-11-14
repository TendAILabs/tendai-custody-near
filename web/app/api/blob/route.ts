import { connection } from "next/server.js";
import { isSha256Hex } from "../../../lib/blob/store.ts";
import { handleBlobPut } from "../../../lib/blob/put-handler.ts";
import { canonicalU64 } from "../../../lib/ids.ts";
import { chainOpenDeps } from "../../../lib/open/deps.ts";
import { handleOpen } from "../../../lib/open/handle.ts";
import { allowRequest, openLimitKey } from "../../../lib/open/limit.ts";

export async function PUT(request: Request): Promise<Response> {
  await connection();
  return handleBlobPut(request);
}

export async function GET(request: Request): Promise<Response> {
  const started = performance.now();
  if (!allowRequest(openLimitKey(request))) {
    console.log(`[blob] GET 429 ${Math.round(performance.now() - started)}ms`);
    return Response.json({ error: "rate limit" }, { status: 429 });
  }
  await connection();
  const url = new URL(request.url);
  const hash = url.searchParams.get("hash") ?? "";
  if (!isSha256Hex(hash)) {
    console.log(`[blob] GET 400 ${Math.round(performance.now() - started)}ms`);
    return Response.json({ error: "bad hash" }, { status: 400 });
  }
  const contractId = process.env.RELAY_CONTRACT_ID ?? "";
  const accountId = url.searchParams.get("account_id") ?? "";
  const nonce = url.searchParams.get("nonce") ?? "";
  const shareParam = url.searchParams.get("share_id");
  const recordParam = url.searchParams.get("record_id");
  const shareId = shareParam ? canonicalU64(shareParam) : "";
  const recordId = recordParam ? canonicalU64(recordParam) : "";
  if ((shareParam && !shareId) || (recordParam && !recordId)) {
    console.log(`[blob] GET 400 ${Math.round(performance.now() - started)}ms`);
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!contractId || !accountId || !nonce || Boolean(shareId) === Boolean(recordId)) {
    console.log(`[blob] GET 403 ${Math.round(performance.now() - started)}ms`);
    return Response.json({ error: "no-ticket" }, { status: 403 });
  }
  const opened = await handleOpen(
    { account_id: accountId, nonce, share_id: shareId || undefined, record_id: recordId || undefined },
    chainOpenDeps(contractId),
  );
  if (!opened.ok) {
    console.log(`[blob] GET ${opened.status} ${Math.round(performance.now() - started)}ms`);
    return opened;
  }
  const payload = (await opened.json()) as { envelopes?: { hash?: string; body_base64?: string }[] };
  const match = payload.envelopes?.find((item) => item.hash === hash);
  if (!match?.body_base64) {
    console.log(`[blob] GET 404 ${Math.round(performance.now() - started)}ms`);
    return new Response("missing", { status: 404 });
  }
  console.log(`[blob] GET 200 ${Math.round(performance.now() - started)}ms`);
  return new Response(Buffer.from(match.body_base64, "base64"), {
    status: 200,
    headers: { "content-type": "application/octet-stream" },
  });
}
