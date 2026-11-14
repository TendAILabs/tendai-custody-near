"use client";

import { useState } from "react";
import Link from "next/link";
import { Arrow, Btn, PageHead } from "@/components/wireframe/c2";
import { CopyWithTips } from "@/components/wireframe/tip";
import { FAQ, FAQ_ROLES, faqForRole, type FaqRole } from "@/lib/copy/faq";
import { SupportDesk } from "@/components/wireframe/support-desk";
import { HIPAA_LINE } from "@/lib/copy/limits";
import { useStory } from "@/lib/story-context";

export default function HelpPage() {
  const { state } = useStory();
  const [role, setRole] = useState<FaqRole>("patients");
  const [on, setOn] = useState(0);
  const items = faqForRole(role);
  const answer = items[on] ?? items[0];
  return (
    <div data-testid="help-page">
      <PageHead
        eyebrow="Help"
        title="Questions, grouped by"
        mark="role"
        what="These are short answers about sharing, revoke, and the chain."
        can="Pick a role and read the answer. Every chart on this site is fictional."
        state={state}
      />
      <div className="c2-row" style={{ marginTop: 8 }} role="group" aria-label="FAQ role">
        {FAQ_ROLES.map((item) => (
          <Btn
            key={item.id}
            small
            tone={item.id === role ? "ink" : "ghost"}
            pressed={item.id === role}
            onClick={() => {
              setRole(item.id);
              setOn(0);
            }}
          >
            {item.label}
          </Btn>
        ))}
      </div>
      <div className="c2-faq">
        <div className="c2-qlist">
          {items.map((item, index) => (
            <button key={item.id} type="button" className={index === on ? "c2-qi on" : "c2-qi"} aria-pressed={index === on} onClick={() => setOn(index)}>
              <span className="n">{String(index + 1).padStart(2, "0")}</span>
              <span>{item.q}</span>
            </button>
          ))}
        </div>
        {answer ? (
          <div>
            <div className="c2-lab ink">
              Question {String(on + 1).padStart(2, "0")} of {String(items.length).padStart(2, "0")}
            </div>
            <h2>{answer.title}</h2>
            <div className="c2-navy c2-qbody">
              {answer.body.map((paragraph) => (
                <p key={paragraph}>
                  <CopyWithTips text={paragraph} />
                </p>
              ))}
            </div>
            <p className="c2-qhint">
              Fictional example. {HIPAA_LINE} {FAQ.length} answers across four roles.
            </p>
          </div>
        ) : null}
      </div>
      <div className="c2-links" style={{ marginTop: 28, maxWidth: 520 }}>
        <Link href="/start">
          Start here <Arrow />
        </Link>
        <Link href="/glossary">
          Glossary <Arrow />
        </Link>
        <Link href="/support">
          Status <Arrow />
        </Link>
        <a href="#support">
          Contact support <Arrow />
        </a>
      </div>
      <SupportDesk />
    </div>
  );
}
