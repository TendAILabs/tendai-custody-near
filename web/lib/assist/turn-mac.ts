import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const LABEL = "assist-turn-v2";

export type MacTurn = { role: "user" | "assistant"; content: string };

export function priorTurnHash(turns: readonly MacTurn[]): string {
  const canonical = turns.map((turn) => `${turn.role}\n${Buffer.byteLength(turn.content)}\n${turn.content}`).join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

function macFor(secret: string, sid: string, index: number, prior: readonly MacTurn[], text: string): string {
  return createHmac("sha256", secret).update(`${LABEL}\n${sid}\n${index}\n${priorTurnHash(prior)}\n${text}`).digest("base64url");
}

export function signAssistTurn(secret: string, sid: string, index: number, prior: readonly MacTurn[], text: string): string {
  return macFor(secret, sid, index, prior, text);
}

export function verifyAssistTurn(
  secret: string,
  sid: string,
  index: number,
  prior: readonly MacTurn[],
  text: string,
  mac: string,
): boolean {
  const expected = macFor(secret, sid, index, prior, text);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}
