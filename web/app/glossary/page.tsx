"use client";

import Link from "next/link";
import { Arrow, PageHead } from "@/components/wireframe/c2";
import { GlossaryTip } from "@/components/wireframe/tip";
import { GLOSSARY } from "@/lib/copy/glossary";
import { HIPAA_LINE } from "@/lib/copy/limits";
import { useStory } from "@/lib/story-context";

export default function GlossaryPage() {
  const { state } = useStory();
  return (
    <div data-testid="glossary-page">
      <PageHead
        eyebrow="Help"
        title="Plain words for the"
        mark="proof"
        what="These are the words the proof pages use."
        can="Read the short meaning here. Dotted words on other pages open the same meaning. Fictional data only."
        state={state}
      />
      <div className="c2-prose">
        {GLOSSARY.map((entry) => (
          <article key={entry.id} id={entry.id}>
            <h2 style={{ textTransform: "none", letterSpacing: "-0.02em", fontFamily: "var(--sans)", fontSize: 22 }}>
              <GlossaryTip id={entry.id} />
            </h2>
            {entry.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </article>
        ))}
        <p className="c2-qhint">{HIPAA_LINE} These definitions are not medical advice.</p>
        <div className="c2-links">
          <Link href="/start">
            Start here <Arrow />
          </Link>
          <Link href="/help">
            FAQ by role <Arrow />
          </Link>
          <Link href="/support">
            Support <Arrow />
          </Link>
        </div>
      </div>
    </div>
  );
}
