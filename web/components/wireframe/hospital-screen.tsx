"use client";

import { useState } from "react";
import Link from "next/link";
import { DEFAULT_CONSULT, ORG, SECTION_BODY, SECTION_LABEL } from "@/lib/fixtures";
import { COPY_UNAVAILABLE_MESSAGE } from "@/lib/open/copy";
import { isTxHash, txUrl } from "@/lib/near/explorer";
import { counselingGranted, referralStatus } from "@/lib/story";
import { useStory } from "@/lib/story-context";
import { IdentifierBestEffort } from "./best-effort";
import { Btn, PageHead, Section, shortId, Tag, txHref } from "./c2";
import { GlossaryTip } from "./tip";

export function HospitalScreen({ titleAs: _titleAs = "h1" }: { titleAs?: "h1" | "h2" }) {
  const { state, openHospital, sendConsult } = useStory();
  const [note, setNote] = useState(DEFAULT_CONSULT);
  const status = referralStatus(state);
  const failure = state.lastOpenError;
  const showChart = state.hospitalOpened && !state.revoked.referral && !state.tamper && failure !== "ERR_TAMPER";
  const openTx = isTxHash(state.hospitalOpenTx) ? state.hospitalOpenTx : null;

  return (
    <div>
      <PageHead
        eyebrow={ORG.hospital}
        title="Open a patient-approved"
        mark="chart"
        what="This is the incoming referral for St. Aster Hospital."
        can="Open the chart only after Maya approves. If she revoked access, the open is refused here."
        lede={
          !state.referralSent || status === "pending"
            ? "Nothing to open yet. Maya has to approve first."
            : state.revoked.referral
              ? "Maya revoked access. A later open is refused by the contract check, and that refusal is not a new transaction."
              : "The open is written to NEAR before the chart appears."
        }
        state={state}
        bad={Boolean(failure)}
      />
      {!state.referralSent ? (
        <div className="c2-empty">
          <div className="c2-lab ink">{ORG.hospital}</div>
          <h2>No referral yet.</h2>
          <p>Nothing to open yet. Maya has to approve first.</p>
          <div className="c2-row">
            <Btn href="/clinic">Go to Riverbend Family Clinic</Btn>
          </div>
        </div>
      ) : status === "pending" ? (
        <div className="c2-empty">
          <div className="c2-lab ink">{ORG.hospital}</div>
          <h2>Waiting for Maya.</h2>
          <p>Nothing to open yet. Maya has to approve first.</p>
          <div className="c2-row">
            <Btn href="/patient">Go to Maya</Btn>
          </div>
        </div>
      ) : null}
      <div className="c2-sec c2-rv" style={{ ["--d" as string]: 1 }}>
        <div className="c2-sentbar" data-testid="hospital-share">
          <div>
            <div className="c2-lab" style={{ marginBottom: 8 }}>
              Status
            </div>
            <div className="big">
              {!state.referralSent
                ? "No live share"
                : failure === "ERR_TAMPER"
                  ? "Open refused. Envelope hash mismatch."
                  : failure === "ERR_REVOKED" || status === "revoked"
                    ? `Access revoked${state.revokedAtLabel ? ` at ${state.revokedAtLabel}` : ""}.`
                    : showChart
                      ? "Chart open"
                      : status === "active"
                        ? "Approved. Waiting for the open."
                        : "Waiting for Maya"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {showChart && state.hospitalOpenTx ? (
              <>
                <Tag tone="ok">Open logged</Tag>
                <div className="mono" style={{ fontSize: 11, color: "#A9B6CC", marginTop: 8 }}>
                  <a href={txHref(state.hospitalOpenTx)} style={{ color: "var(--mint)" }} title={state.hospitalOpenTx} target="_blank" rel="noreferrer">
                    {shortId(state.hospitalOpenTx, 8, 7)}
                  </a>
                </div>
              </>
            ) : (
              <Btn testId="hospital-open" guide="open" disabled={!state.referralSent || (status !== "active" && status !== "revoked")} onClick={openHospital}>
                Open chart
              </Btn>
            )}
          </div>
        </div>
      </div>
      {state.referralSent ? (
        <section className="c2-sec c2-rv" data-testid="hospital-proof" style={{ ["--d" as string]: 1 }}>
          <div className="c2-sec-h">
            <span className="t">
              Proof <em>Receipt and open ticket</em>
            </span>
          </div>
          <div className="c2-sec-b">
            <p>The sealed summary receipt is on the verification page. This hospital screen does not re-check that signature.</p>
            <p>
              <Link href="/verification" data-testid="hospital-tee-link">
                Open the verification page
              </Link>
            </p>
            {openTx ? (
              <p>
                Open ticket transaction. This is the request_open call on NEAR testnet. The ticket is only fresh for about 120 seconds. The link stays so you can read the transaction.{" "}
                <a data-testid="hospital-open-tx" href={txUrl(openTx)} target="_blank" rel="noreferrer">
                  {shortId(openTx, 8, 7)}
                </a>
              </p>
            ) : (
              <p data-testid="hospital-open-tx">No open-ticket transaction is saved in this session yet.</p>
            )}
          </div>
        </section>
      ) : null}
      {state.revoked.referral && state.blockedAttempt ? (
        <p className="c2-banner" data-testid="revoked-banner">
          Maya revoked access{state.revokedAtLabel ? ` at ${state.revokedAtLabel}` : ""}. The contract check refused this open, and nothing new was written or shared.{" "}
          <GlossaryTip id="revoke">ERR_REVOKED</GlossaryTip> means Maya revoked access. This cannot erase a copy already downloaded.
        </p>
      ) : null}
      {failure === "ERR_TAMPER" ? (
        <p className="c2-lede" data-testid="hospital-error">
          One envelope byte was flipped, so the hash does not match the chain. <Link href="/verification/tamper">Tamper screen</Link>
        </p>
      ) : null}
      {failure && failure !== "ERR_REVOKED" && failure !== "ERR_TAMPER" ? (
        <p className="c2-lede" data-testid="hospital-error">
          request_open failed: {failure}
        </p>
      ) : null}
      {!showChart && state.chainError === COPY_UNAVAILABLE_MESSAGE ? (
        <p className="c2-lede" data-testid="hospital-copy-error">
          {COPY_UNAVAILABLE_MESSAGE} <Link href="/patient">Back to Maya</Link>
        </p>
      ) : null}
      {showChart ? (
        <div data-testid="hospital-chart">
          <Section index="00" title="Verified summary" delay={1}>
            <div className="c2-navy c2-summary">
              <IdentifierBestEffort verified />
              <p className="txt">
                {state.summaryText.trim()
                  ? state.summaryText
                  : counselingGranted(state)
                    ? "The approved artifact still includes the 2021 counseling visit."
                    : "Minimum necessary summary. The 2021 counseling visit was left out by Maya."}
              </p>
            </div>
          </Section>
          <div className="c2-tiles">
            {state.grantedSections.map((key, index) => (
              <Section key={key} index={String(index + 1).padStart(2, "0")} title={SECTION_LABEL[key]} delay={2}>
                <p>{SECTION_BODY[key]}</p>
                {key === "notes" ? (
                  <p className="c2-lede">{counselingGranted(state) ? "Counseling note is in this artifact." : "Counseling note excluded."}</p>
                ) : null}
              </Section>
            ))}
          </div>
          <div className="c2-cols" id="reply" style={{ marginTop: 6 }}>
            <Section index="06" title="Reply to the referring clinic" aside="Logged when you send" delay={4}>
              {state.consultSent ? (
                <div className="c2-panel" style={{ padding: "14px 16px" }}>
                  <p>{state.consultNote}</p>
                  {state.consultTx ? (
                    <p className="mono" style={{ marginTop: 8, fontSize: 12 }}>
                      <a href={txHref(state.consultTx)} target="_blank" rel="noreferrer">
                        {state.consultTx}
                      </a>
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <textarea id="consult-note" className="c2-field" value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
                  <div style={{ marginTop: 12 }}>
                    <Btn testId="send-reply" onClick={() => sendConsult(note)}>
                      Send consult note
                    </Btn>
                  </div>
                </>
              )}
            </Section>
          </div>
        </div>
      ) : (
        <p className="c2-lede" id="reply">
          {state.referralSent
            ? "The consult reply appears here after the chart is open. A ticket is only fresh for about two minutes."
            : "When Maya approves, the open lands here."}
        </p>
      )}
    </div>
  );
}
