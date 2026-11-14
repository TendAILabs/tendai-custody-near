"use client";

import { Btn, PageHead } from "@/components/wireframe/c2";
import { CopyWithTips } from "@/components/wireframe/tip";
import { DEMO, HIPAA_LINE, REAL } from "@/lib/copy/limits";
import { useStory } from "@/lib/story-context";

export default function TermsPage() {
  const { state } = useStory();
  return (
    <div>
      <PageHead
        index="13"
        eyebrow="Terms of use"
        title="A practice demo on"
        mark="testnet"
        lede="Please read this before you click around. It is short on purpose."
        state={state}
      />
      <div className="c2-prose">
        <h2>01 · What this is</h2>
        <p>TendAI Custody is a demo that runs on NEAR testnet. It shows a patient-approved referral and a custody log. It is not a live clinic system and not a medical device.</p>
        <h2>02 · What you can rely on</h2>
        {REAL.map((line) => (
          <p key={line}>
            <CopyWithTips text={line} />
          </p>
        ))}
        <h2>03 · What you should not assume</h2>
        {DEMO.map((line) => (
          <p key={line}>
            <CopyWithTips text={line} />
          </p>
        ))}
        <p>{HIPAA_LINE} It must not be used with real patient records.</p>
        <h2>04 · No professional advice</h2>
        <p>The fictional chart, the sealed summary, and the hospital reply are examples only. They are not medical advice.</p>
        <h2>05 · Your use</h2>
        <p>You may explore the walkthrough, the log, Help, the glossary, and Support. Do not load real health information. The support form is local. Nothing is sent, and it is not a live support channel.</p>
        <p>
          <Btn small tone="ghost" href="/start">
            Start here
          </Btn>
        </p>
      </div>
    </div>
  );
}
