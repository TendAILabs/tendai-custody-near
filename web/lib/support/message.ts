export const SUPPORT_SUBJECT_MAX = 120;
export const SUPPORT_MESSAGE_MAX = 2000;

export type SupportAction = "create" | "list" | "admin" | "reply" | "close";

export function supportMessage(
  action: SupportAction,
  nonce: string,
  fields: { subject?: string; message?: string; ticketId?: string; reply?: string } = {},
): string {
  const body = {
    domain: "tendai.support",
    version: 1,
    action,
    nonce,
    subject: fields.subject ?? "",
    message: fields.message ?? "",
    ticketId: fields.ticketId ?? "",
    reply: fields.reply ?? "",
  };
  return `tendai.support/v1\n${JSON.stringify(body)}`;
}

export function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    const byte = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    if (!Number.isFinite(byte)) return null;
    out[index] = byte;
  }
  return out;
}
