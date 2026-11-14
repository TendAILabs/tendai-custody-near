"use client";

import { MAYA, ORG, SECTION_KEYS, SECTION_LABEL } from "@/lib/fixtures";
import { referralStand } from "@/lib/nav/model";
import { useStory } from "@/lib/story-context";
import { useAccountReady } from "@/lib/visitor/use-account";
import { Arrow, Btn, PageHead, Section, Tag, txHref } from "./c2";

export function ClinicScreen({ titleAs: _titleAs = "h1" }: { titleAs?: "h1" | "h2" }) {
  const { state, toggleRequested, toggleIncludeCounseling, setPurpose, sendReferral } = useStory();
  const account = useAccountReady();
  const locked = state.referralSent;
  const offered = state.requestedSections.length + (state.includeCounseling ? 1 : 0);
  const canSend = !locked && account.setupDone && state.requestedSections.length > 0 && state.purpose.trim() !== "";
  const stand = referralStand(state);

  return (
    <div>
      <PageHead
        eyebrow="Riverbend Family Clinic"
        title="Refer a patient to a"
        mark="hospital"
        what="This is where Riverbend Family Clinic prepares Maya's referral."
        can="Choose the sections to offer, keep the sensitive note marked, and send. Only ids and hashes go on NEAR."
        state={state}
      />
      <div className="c2-sec c2-rv" style={{ ["--d" as string]: 1 }}>
        <div className="c2-sentbar" data-testid={state.referralSent ? "referral-sent" : undefined}>
          <div>
            <div className="c2-lab" style={{ marginBottom: 8 }}>
              Status
            </div>
            <div className="big">{state.referralSent ? "Sent, waiting for Maya" : "Not sent yet"}</div>
            <p className="c2-lede" style={{ marginTop: 8 }}>
              {!account.setupDone
                ? "Maya's account is not set up yet. Set it up on her page before you send."
                : account.kind === "demo-server"
                  ? "Maya confirmed the shared demo account on her page."
                  : "Maya's account is ready. She set it up on her page."}
            </p>
            {state.chainError && !state.referralSent ? (
              <p className="c2-note bad" data-testid="clinic-error" style={{ marginTop: 8 }}>
                {state.chainError}
              </p>
            ) : null}
          </div>
          <div style={{ textAlign: "right" }}>
            {!state.referralSent ? (
              <Btn testId="send-referral" guide="send" disabled={!canSend} onClick={sendReferral}>
                Send referral <Arrow />
              </Btn>
            ) : state.referralTx ? (
              <a href={txHref(state.referralTx)} target="_blank" rel="noreferrer" style={{ color: "var(--mint)" }}>
                Proof on NEAR testnet
              </a>
            ) : (
              <span className="mono" style={{ fontSize: 12, color: "#A9B6CC" }}>
                Hashes land on NEAR when you send
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="c2-cols">
        <div>
          <Section index="A" title="Shared sections" aside={`${offered} of 6 will be offered`} delay={2}>
            <div style={{ paddingTop: 2 }}>
              {SECTION_KEYS.map((key, index) => {
                const on = state.requestedSections.includes(key);
                return (
                  <div className="c2-nrow" key={key}>
                    <span className="n">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <b>{SECTION_LABEL[key]}</b>
                    </div>
                    <button type="button" disabled={locked} onClick={() => toggleRequested(key)} aria-pressed={on} className="c2-tag q" style={{ border: 0, background: "none" }}>
                      {on ? "Included" : "Left out"}
                    </button>
                  </div>
                );
              })}
              <div className="c2-nrow c2-sens">
                <span className="n">06</span>
                <div>
                  <b>2021 counseling note</b>
                  <p>This note is sensitive, and cardiology does not need it. Maya can leave it out.</p>
                </div>
                <button type="button" data-testid="include-counseling" disabled={locked} aria-pressed={state.includeCounseling} onClick={toggleIncludeCounseling} className="c2-tag ni" style={{ background: "var(--ink)", color: "#fff", border: 0 }}>
                  {state.includeCounseling ? "Sensitive" : "Left out"}
                </button>
              </div>
            </div>
          </Section>
          <Section index="B" title="Purpose" aside="Maya reads this" delay={3}>
            <textarea id="purpose" className="c2-field" value={state.purpose} disabled={locked} onChange={(event) => setPurpose(event.target.value)} rows={2} />
            <p className="c2-lede">This referral goes to {ORG.hospital}. Northgate Heart Institute is a later second opinion, and it is not a destination here.</p>
          </Section>
        </div>
        <Section index="C" title={MAYA.name} aside="Fictional patient" delay={3}>
          <p className="c2-lede">This story has one patient. Her chart stays on this device until she approves a share.</p>
          {state.referralSent ? <Tag tone="q">Sent</Tag> : <Tag tone="qmut">Not sent</Tag>}
        </Section>
      </div>
      <Section index="D" title="Where this referral stands" delay={4}>
        <div id="sent" data-testid="sent-referrals">
          {stand === "Not sent" ? (
            <p className="c2-lede">Nothing has been sent yet. The status stays here after you send.</p>
          ) : (
            <>
              <p className="c2-lede">
                Status: {stand}. {stand === "Pending" ? "Maya still has to approve it." : null}
                {stand === "Approved" ? "Maya approved it, and the hospital has not opened it yet." : null}
                {stand === "Opened" ? "St. Aster Hospital has opened the chart." : null}
                {stand === "Revoked" ? "Maya revoked access. A later open is refused." : null}
                {stand === "Declined" ? "Maya declined the request." : null}
              </p>
              {state.consultSent ? (
                <p className="c2-lede" data-testid="consult-reply">
                  Consult reply: {state.consultNote || "The hospital sent a note."}
                </p>
              ) : (
                <p className="c2-lede">No consult reply has arrived yet.</p>
              )}
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
