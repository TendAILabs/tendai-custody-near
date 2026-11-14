"use client";

import { useState } from "react";
import { CLOCK, DEFAULT_SECOND_REPLY, ORG, PEOPLE } from "@/lib/fixtures";
import { expiryDate, summaryParagraph } from "@/lib/story";
import { useStory } from "@/lib/story-context";
import { Arrow, Btn, PageHead, Section, Tag } from "./c2";

export function ReyesScreen({ titleAs: _titleAs = "h1" }: { titleAs?: "h1" | "h2" }) {
  const { state, openSecond, sendSecondReply } = useStory();
  const [note, setNote] = useState(DEFAULT_SECOND_REPLY);

  return (
    <div>
      <PageHead
        eyebrow="Northgate Heart Institute"
        title="Read-only records shared with"
        mark="you"
        what="Dr. Sofia Reyes at Northgate Heart Institute gives a second opinion. This part of the story is optional."
        can="View what Maya shared for a set number of days, and send your opinion back to her."
        lede={state.secondSent ? `The reply goes to Maya, not back to ${ORG.clinic}.` : "Nothing has been shared yet. Maya sends this from her records when she wants a second opinion."}
        state={state}
        bad={state.revoked.second}
      />
      {!state.secondSent ? (
        <div className="c2-empty">
          <div className="c2-lab ink">Second opinion</div>
          <h2>Nothing is here yet.</h2>
          <p>A second-opinion share reaches Dr. Reyes only after Maya sends it. The clinic cannot send this for her, and the hospital cannot either.</p>
          <div className="c2-row">
            <Btn href="/patient">
              Go to Maya <Arrow />
            </Btn>
            <Btn tone="ghost" href="/help">
              Why is this empty?
            </Btn>
          </div>
        </div>
      ) : state.revoked.second ? (
        <Section index="A" title="Revoked">
          <div data-testid="reyes-revoked">
            <Tag tone="bad">Revoked</Tag>
            <p className="c2-body" style={{ marginTop: 12 }}>
              Access revoked by the patient at {state.revokedAtLabel ?? CLOCK.revokeShort}. The next open fails with ERR_REVOKED.
            </p>
          </div>
        </Section>
      ) : (
        <>
          <div className="c2-row" style={{ marginTop: 20 }}>
            <Tag tone="sec2">Read only</Tag>
            <Tag testId="reyes-expiry" tone="q">
              {state.secondExpiry} days, through {expiryDate(state.secondExpiry)}
            </Tag>
          </div>
          <p className="c2-lede">Recipients cannot re-share through TendAI Custody.</p>
          {!state.secondOpened ? (
            <div className="c2-row" style={{ marginTop: 8 }}>
              <Btn testId="reyes-open" onClick={openSecond}>
                Open the share <Arrow />
              </Btn>
            </div>
          ) : (
            <div data-testid="reyes-chart">
              <Section index="A" title="Summary Maya sent">
                <p className="c2-body">{summaryParagraph(state)}</p>
              </Section>
              <Section index="B" title="Reply to Maya only">
                {state.secondReplySent ? (
                  <p className="c2-body">{state.secondReply}</p>
                ) : (
                  <>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={4}
                      className="c2-field"
                      aria-label="Reply to Maya"
                    />
                    <div className="c2-row" style={{ marginTop: 12 }}>
                      <Btn testId="reyes-reply-send" onClick={() => sendSecondReply(note)}>
                        Send reply to Maya <Arrow />
                      </Btn>
                    </div>
                  </>
                )}
              </Section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
