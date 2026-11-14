"use client";

import Link from "next/link";
import { Arrow, PageHead, Section } from "@/components/wireframe/c2";
import { CopyWithTips } from "@/components/wireframe/tip";
import { DEMO, HIPAA_LINE, REAL } from "@/lib/copy/limits";
import { WALKTHROUGH } from "@/lib/copy/walkthrough";
import { useStory } from "@/lib/story-context";

export default function StartPage() {
  const { state } = useStory();
  return (
    <div data-testid="start-page">
      <PageHead
        eyebrow="Proof"
        title="What is real, and what is a"
        mark="demo"
        what="This page separates the NEAR testnet calls from the parts that are only the story."
        can="You can read that split, and you can follow the same seven steps as the guided demo."
        state={state}
      />
      <div className="c2-cols" style={{ marginTop: 8 }}>
        <Section index="A" title="What is real">
          {REAL.map((line) => (
            <p key={line} style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
              <CopyWithTips text={line} />
            </p>
          ))}
        </Section>
        <Section index="B" title="What is the demo" delay={2}>
          {DEMO.map((line) => (
            <p key={line} style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
              <CopyWithTips text={line} />
            </p>
          ))}
          <p className="c2-qhint">{HIPAA_LINE}</p>
        </Section>
      </div>
      <Section index="C" title="3-minute walkthrough" aside="Testnet, fictional data" delay={3}>
        <p style={{ marginTop: 0, lineHeight: 1.6 }}>
          If a welcome box is open, choose the guided demo or look around on your own. The guided demo uses the demo server account. A connected wallet can call self_register_patient on the live contract and register as a patient.
        </p>
        {WALKTHROUGH.map((step) => (
          <div className="c2-srow" key={step.at}>
            <i className="sw" />
            <div>
              <b>
                {step.at} · {step.title}
              </b>
              <p>
                <CopyWithTips text={step.body} />
              </p>
              <p>
                <Link href={step.href}>{step.link}</Link>
                {step.also ? (
                  <>
                    {" · "}
                    <Link href={step.also.href}>{step.also.link}</Link>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        ))}
      </Section>
      <div className="c2-links" style={{ marginTop: 8, maxWidth: 520 }}>
        <Link href="/help">
          FAQ by role <Arrow />
        </Link>
        <Link href="/glossary">
          Glossary <Arrow />
        </Link>
        <Link href="/support">
          Support and status <Arrow />
        </Link>
      </div>
    </div>
  );
}
