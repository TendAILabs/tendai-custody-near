"use client";

import { DEID_AFTER } from "@/lib/fixtures";
import { COPY_UNAVAILABLE_MESSAGE } from "@/lib/open/copy";
import { useStory } from "@/lib/story-context";
import { Arrow, Btn, PageHead, Section, Tag } from "./c2";

export function PulsefitScreen({ titleAs: _titleAs = "h1" }: { titleAs?: "h1" | "h2" }) {
  const { state, openDeid } = useStory();

  return (
    <div>
      <PageHead
        eyebrow="PulseFit"
        title="A fictional fitness"
        mark="app"
        what="PulseFit can hold a copy with identifiers removed, and that removal is best effort."
        can="Open the copy only after Maya sends it. If she revokes it, the next fetch is refused."
        state={state}
      />
      <div className="c2-row" style={{ marginTop: 16 }}>
        <Tag testId="deid-label" tone="app">
          De-identified by patient, best effort
        </Tag>
      </div>
      {!state.deidSent ? (
        <Section index="A" title="No copy yet">
          <p className="c2-body">PulseFit never receives a named chart. Maya sends a stripped copy from the de-identify screen.</p>
          <div className="c2-row" style={{ marginTop: 14 }}>
            <Btn href="/patient/deid#deid-preview">
              Go to the preview <Arrow />
            </Btn>
            <Btn tone="ghost" href="/help">
              Why is this empty?
            </Btn>
          </div>
        </Section>
      ) : state.revoked.deid ? (
        <Section index="A" title="Revoked">
          <p className="c2-body">
            Access revoked by the patient at {state.revokedAtLabel ?? "the time she revoked"}. Future fetches through TendAI Custody stop. A copy already saved on a device is outside this system.
          </p>
        </Section>
      ) : !state.deidOpened ? (
        <div style={{ marginTop: 20 }}>
          <div className="c2-row">
            <Btn testId="pulse-open" onClick={openDeid}>
              Open stripped copy <Arrow />
            </Btn>
          </div>
          {state.chainError === COPY_UNAVAILABLE_MESSAGE ? (
            <div className="c2-row" style={{ marginTop: 14 }} data-testid="pulse-open-error">
              <Btn href="/patient/deid#deid-preview">Send the copy again</Btn>
            </div>
          ) : null}
        </div>
      ) : (
        <Section index="A" title="Stripped copy">
          <div data-testid="pulse-body">
            <p className="c2-body">{state.deidAfter || DEID_AFTER}</p>
            <p className="c2-lede">This screen has no name, MRN, address, phone, or calendar date.</p>
          </div>
        </Section>
      )}
    </div>
  );
}
