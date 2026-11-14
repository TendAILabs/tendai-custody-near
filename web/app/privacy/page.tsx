"use client";

import { Btn, PageHead } from "@/components/wireframe/c2";
import { CopyWithTips } from "@/components/wireframe/tip";
import { DEMO, HIPAA_LINE, REAL } from "@/lib/copy/limits";
import { useStory } from "@/lib/story-context";

export default function PrivacyPage() {
  const { state } = useStory();
  return (
    <div>
      <PageHead
        index="12"
        eyebrow="Privacy notice"
        title="How this demo treats"
        mark="information"
        lede={`Plain language for a first visit. ${HIPAA_LINE}`}
        state={state}
      />
      <div className="c2-prose">
        <h2>01 · What is real</h2>
        {REAL.map((line) => (
          <p key={line}>
            <CopyWithTips text={line} />
          </p>
        ))}
        <h2>02 · What is the demo</h2>
        {DEMO.map((line) => (
          <p key={line}>
            <CopyWithTips text={line} />
          </p>
        ))}
        <h2>03 · What is stored on NEAR</h2>
        <p>The contract stores ids and hashes, plus timestamps: who shared what, with whom, and when. It does not store health data, names, or the text of a chart.</p>
        <h2>04 · Sealed summaries</h2>
        <p>A short summary is written by NEAR AI inside a TEE, and it comes back with a receipt. In this demo the server sees the plaintext chart for the TEE call. Maya can read the summary before she approves a share. The summary is not medical advice.</p>
        <h2>05 · De-identification is best effort</h2>
        <p>Removing identifiers is best effort, with a preview. A stripped copy removes common identifiers and shows that preview first. This may miss something. It is not a promise that the copy cannot be re-identified.</p>
        <h2>06 · Revoking access</h2>
        <p>Revoke is an on-chain call. It stops the next open. Revoke cannot erase a copy someone already downloaded or saved.</p>
        <h2>07 · Keys</h2>
        <p>The demo server account uses a fictional testnet key held by the demo server on testnet. The live contract includes self_register_patient, so a connected wallet can register itself as a patient.</p>
        <h2>08 · This support form</h2>
        <p>The note form on Support is local. Nothing is sent, and the words are not stored. Do not type a real name, a real contact detail, or a real patient record.</p>
        <p>{HIPAA_LINE}</p>
        <p>
          <Btn small tone="ghost" href="/support">
            Back to Support
          </Btn>
        </p>
      </div>
    </div>
  );
}
