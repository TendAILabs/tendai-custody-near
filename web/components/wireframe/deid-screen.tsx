"use client";

import { useState } from "react";
import Link from "next/link";
import { DEID_AFTER, DEID_BEFORE, MODEL_ID, ORG, type WalletMethod } from "@/lib/fixtures";
import { useStory } from "@/lib/story-context";
import { Arrow, Btn, PageHead, Section, Tag } from "./c2";
import { GlossaryTip } from "./tip";
import { WalletModal } from "./wallet-modal";

export function DeidScreen({ titleAs: _titleAs = "h1" }: { titleAs?: "h1" | "h2" }) {
  const { state, activity, runLeak, sendDeid } = useStory();
  const [wallet, setWallet] = useState<WalletMethod | null>(null);
  const before = state.deidBefore;
  const after = state.deidAfter;

  return (
    <div>
      <PageHead
        eyebrow="Patient"
        title="Send a copy without your"
        mark="name"
        what="PulseFit is a fictional fitness app. This page previews a copy with identifiers removed, and that removal is best effort."
        can="Run the leak scan, read the preview, and then send the copy to PulseFit."
        state={state}
      />
      <p className="c2-lede">
        The <GlossaryTip id="deidentification">leak scan</GlossaryTip> looks for names and dates before anything is sent. Absolute dates become Day 0 and Day +14.
      </p>
      <div id="deid-preview" className="c2-cols eq" style={{ marginTop: 26, alignItems: "stretch", scrollMarginTop: 96 }}>
        <div className="c2-rv" style={{ ["--d" as string]: 1, display: "flex", flexDirection: "column" }}>
          <div className="c2-sec-h" style={{ marginBottom: 12 }}>
            <span className="t">
              A <em>Before</em>
            </span>
            <span className="r">What Maya's chart says</span>
          </div>
          <div className="c2-panel c2-ba" data-testid="deid-before">
            {before
              ? before
              : DEID_BEFORE.map((part, index) =>
                  part.label ? (
                    <span className="c2-rd" key={index}>
                      {part.text}
                      <i>{part.label}</i>
                    </span>
                  ) : (
                    <span key={index}>{part.text}</span>
                  ),
                )}
          </div>
        </div>
        <div className="c2-rv" style={{ ["--d" as string]: 2, display: "flex", flexDirection: "column" }}>
          <div className="c2-sec-h" style={{ marginBottom: 12 }}>
            <span className="t">
              B <em>After</em>
            </span>
            <span className="r">
              <Tag tone="app">De-identified</Tag>
            </span>
          </div>
          <div className="c2-panel c2-ba ink" data-testid="deid-after">
            {after ? (
              after
            ) : (
              <>
                <span className="c2-tok">NAME</span> <span className="c2-tok">DOB</span> <span className="c2-tok">MRN</span> <span className="c2-tok">ADDRESS</span> <span className="c2-tok">PHONE</span> <span className="c2-tok">INSURER</span> removed. {DEID_AFTER}
              </>
            )}
          </div>
        </div>
      </div>
      <Section index="C" title="What left the device" aside="Removed: name, DOB, MRN, address, phone, insurer id, calendar date" delay={3}>
        <div className="c2-flow">
          <div className="st" style={{ ["--c" as string]: "var(--ink)" }}>
            <span className="nd fill" />
            <b>1 · This device</b>
            <p>In this demo the encryption keys are seeded on the server.</p>
          </div>
          <div className="st" style={{ ["--c" as string]: "var(--h-clinic)" }}>
            <span className="nd" />
            <b>2 · E2EE</b>
            <p>The request is encrypted to the attested model key.</p>
          </div>
          <div className="st" style={{ ["--c" as string]: "var(--h-2nd)" }}>
            <span className="nd" />
            <b>3 · Attested model</b>
            <p>{MODEL_ID} in a NEAR AI Cloud TEE.</p>
          </div>
          <div className="st" style={{ ["--c" as string]: "var(--sig)" }}>
            <span className="nd fill" />
            <b>4 · NEAR testnet</b>
            <p>Hashes, scope, expiry and custody events only.</p>
          </div>
        </div>
      </Section>
      <div className="c2-row c2-rv" style={{ ["--d" as string]: 4, marginTop: 20 }}>
        {state.leakScan === "clean" ? (
          <div className="c2-leak" data-testid="leak-clean">
            <Tag tone="ok">Leak scan clear</Tag>
            <span>No planted identifier remains. Best effort, with this preview.</span>
          </div>
        ) : state.leakScan === "hit" ? (
          <div className="c2-leak" data-testid="leak-hit">
            <Tag tone="bad">Leak scan blocked</Tag>
            <span>A planted identifier is still in the copy. Send stays blocked.</span>
          </div>
        ) : (
          <Btn testId="run-leak" disabled={Boolean(activity)} onClick={runLeak}>
            {activity ? "Running the TEE pass" : "Run leak scan"} <Arrow />
          </Btn>
        )}
        {state.deidSent ? (
          <div data-testid="deid-sent" className="c2-sent-copy">
            <Tag tone="app">Sent to {ORG.app}</Tag>
            <Link href="/pulsefit" style={{ textDecoration: "underline", textDecorationColor: "var(--sig)" }}>
              Open PulseFit
            </Link>
            {state.deidTx ? <div className="mono c2-tx">{state.deidTx}</div> : null}
          </div>
        ) : (
          <Btn testId="send-deid" disabled={state.leakScan !== "clean"} onClick={() => setWallet("create_share")}>
            Send to PulseFit <Arrow />
          </Btn>
        )}
      </div>
      {wallet ? (
        <WalletModal
          method={wallet}
          onCancel={() => setWallet(null)}
          onSign={() => sendDeid()}
        />
      ) : null}
    </div>
  );
}
