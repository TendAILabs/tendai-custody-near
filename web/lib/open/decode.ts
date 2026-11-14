import type { EnvelopeV1 } from "../crypto/envelope.ts";

export function decodeEnvelopeJson(raw: string): EnvelopeV1 {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new Error("bad base64");
  const parsed: unknown = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  if (!parsed || typeof parsed !== "object") throw new Error("bad envelope");
  return parsed as EnvelopeV1;
}
