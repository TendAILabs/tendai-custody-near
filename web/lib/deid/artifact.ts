import { createHash } from "node:crypto";
import { putBlob } from "../blob/store.ts";
import { actorKeyPair } from "../crypto/actor-key.ts";
import { canonicalEnvelopeBytes, encryptEnvelope } from "../crypto/envelope.ts";

export function deidReceiptHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function deidArtifactAad(receiptHash: string): string {
  return `deid|${receiptHash}|v1`;
}

export async function sealDeidArtifact(text: string, receiptHash: string, directory?: string): Promise<string> {
  const seed = process.env.DEMO_ENC_SEED ?? "";
  const patient = process.env.DEMO_PATIENT_ACCOUNT_ID ?? "";
  const app = process.env.PULSEFIT_ACCOUNT_ID ?? "";
  if (!/^[0-9a-f]{64}$/i.test(seed) || !patient || !app) throw new Error("demo keys missing");
  const patientKey = actorKeyPair(seed, patient);
  const appKey = actorKeyPair(seed, app);
  const envelope = encryptEnvelope({
    plaintext: new TextEncoder().encode(text),
    aad: deidArtifactAad(receiptHash),
    recipients: [
      { account_id: app, publicKey: appKey.publicKey },
      { account_id: patient, publicKey: patientKey.publicKey },
    ],
  });
  return putBlob(canonicalEnvelopeBytes(envelope), directory);
}
