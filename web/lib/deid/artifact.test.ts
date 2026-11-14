import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { getBlob } from "../blob/store.ts";
import type { EnvelopeV1 } from "../crypto/envelope.ts";
import { openedText } from "../demo/open-text.ts";
import { deidArtifactAad, deidReceiptHash, sealDeidArtifact } from "./artifact.ts";

test("M2 a deid receipt seals the artifact open can read", async () => {
  const previous = {
    DEMO_ENC_SEED: process.env.DEMO_ENC_SEED,
    DEMO_PATIENT_ACCOUNT_ID: process.env.DEMO_PATIENT_ACCOUNT_ID,
    PULSEFIT_ACCOUNT_ID: process.env.PULSEFIT_ACCOUNT_ID,
  };
  const directory = await mkdtemp(path.join(tmpdir(), "rr-deid-"));
  process.env.DEMO_ENC_SEED = "ab".repeat(32);
  process.env.DEMO_PATIENT_ACCOUNT_ID = "patient.test";
  process.env.PULSEFIT_ACCOUNT_ID = "pulsefit.test";
  try {
    const text = "Adult patient. Chest tightness on stairs. Day +14 labs: LDL 168 mg/dL.";
    const receipt = deidReceiptHash(text);
    const artifact = await sealDeidArtifact(text, receipt, directory);
    assert.equal(/^[0-9a-f]{64}$/.test(artifact), true);
    assert.notEqual(artifact, receipt);
    const bytes = await getBlob(artifact, directory);
    assert.ok(bytes);
    const envelope = JSON.parse(new TextDecoder().decode(bytes ?? new Uint8Array())) as EnvelopeV1;
    assert.equal(envelope.aad, deidArtifactAad(receipt));
    assert.equal(new TextDecoder().decode(bytes ?? new Uint8Array()).includes(text), false);
    const opened = openedText({ accountId: "pulsefit.test", shareId: "9", envelope });
    assert.equal(opened, text);
    assert.equal(openedText({ accountId: "pulsefit.test", shareId: "09", envelope }), null);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
