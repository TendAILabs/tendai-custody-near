import { connection } from "next/server";
import { openedText } from "../../../lib/demo/open-text";
import { canonicalU64 } from "../../../lib/ids";
import { chainOpenDeps } from "../../../lib/open/deps";
import { handleOpen, type OpenRequest } from "../../../lib/open/handle";
import { decodeEnvelopeJson } from "../../../lib/open/decode";
import { allowRequest, openLimitKey } from "../../../lib/open/limit";

export async function POST(request: Request): Promise<Response> {
  await connection();
  const started = performance.now();
  if (!allowRequest(openLimitKey(request))) {
    console.log(`[open] POST 429 ${Math.round(performance.now() - started)}ms`);
    return Response.json({ error: "rate limit" }, { status: 429 });
  }
  const contractId = process.env.RELAY_CONTRACT_ID ?? "";
  if (!contractId) {
    console.log(`[open] POST 500 ${Math.round(performance.now() - started)}ms`);
    return Response.json({ error: "contract not configured" }, { status: 500 });
  }
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    console.log(`[open] POST 400 ${Math.round(performance.now() - started)}ms`);
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.log(`[open] POST 400 ${Math.round(performance.now() - started)}ms`);
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const record = parsed as Record<string, unknown>;
  for (const field of ["account_id", "nonce", "share_id", "record_id"] as const) {
    if (field in record && record[field] != null && typeof record[field] !== "string") {
      console.log(`[open] POST 400 ${Math.round(performance.now() - started)}ms`);
      return Response.json({ error: "bad request" }, { status: 400 });
    }
  }
  const body = parsed as OpenRequest;
  const response = await handleOpen(body, chainOpenDeps(contractId));
  if (!response.ok) {
    console.log(`[open] POST ${response.status} ${Math.round(performance.now() - started)}ms`);
    return response;
  }
  const payload = (await response.json()) as { envelopes?: { hash?: string; body_base64?: string }[] };
  const raw = payload.envelopes?.[0]?.body_base64 ?? "";
  let text: string | null = null;
  if (raw) {
    try {
      const envelope = decodeEnvelopeJson(raw);
      text = openedText({ accountId: body.account_id ?? "", shareId: canonicalU64(body.share_id) ?? undefined, envelope });
    } catch {
      console.log(`[open] POST 400 ${Math.round(performance.now() - started)}ms`);
      return Response.json({ error: "bad request" }, { status: 400 });
    }
  }
  console.log(`[open] POST 200 ${Math.round(performance.now() - started)}ms`);
  return Response.json({ ...payload, text });
}
