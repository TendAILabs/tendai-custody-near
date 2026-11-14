import { actorKeyPair } from "../crypto/actor-key.ts";
import { decryptEnvelope, type EnvelopeV1 } from "../crypto/envelope.ts";
import { canonicalU64 } from "../ids.ts";

export function openedText(input: { accountId: string; shareId?: string; envelope: EnvelopeV1 }): string | null {
  const seed = process.env.DEMO_ENC_SEED ?? "";
  const shareId = canonicalU64(input.shareId);
  if (!/^[0-9a-f]{64}$/i.test(seed) || !shareId) return null;
  const deidAad = /^deid\|[0-9a-f]{64}\|v1$/.test(input.envelope.aad) ? input.envelope.aad : "";
  try {
    const keys = actorKeyPair(seed, input.accountId);
    const plain = decryptEnvelope({
      envelope: input.envelope,
      account_id: input.accountId,
      secretKey: keys.secretKey,
      expectedAad: deidAad || `${shareId}|artifact|v1`,
    });
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
