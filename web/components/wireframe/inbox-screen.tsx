"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MODEL_ID, ORG, PEOPLE, SECTION_KEYS, SECTION_LABEL, type SectionKey, type WalletMethod } from "@/lib/fixtures";
import { approveBlock, counselingGranted, expiryDate, referralStatus, summaryParagraph } from "@/lib/story";
import { pendingForSession } from "@/lib/relay/flow";
import { useStory } from "@/lib/story-context";
import { IdentifierBestEffort } from "./best-effort";
import { Arrow, Btn, PageHead, Section, shortId, Tag, Tick, txHref } from "./c2";
import { PatientSetup } from "./patient-setup";
import { Tip } from "./tip";
import { WalletModal } from "./wallet-modal";

function bangkok(ms: number | null): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

function receiptSigner(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { signer?: string };
    return parsed.signer ?? "";
  } catch {
    return "";
  }
}

export function RequestsScreen({ embedded: _embedded = false }: { embedded?: boolean }) {
  const { state, activity, toggleGranted, toggleGrantCounseling, setExpiry, setSecondExpiry, runSummary, approve, decline, revoke, sendSecond } = useStory();
  const [wallet, setWallet] = useState<WalletMethod | null>(null);
  const [pendingOnChain, setPendingOnChain] = useState<number | null>(null);
  const [secondPicks, setSecondPicks] = useState<SectionKey[]>(["imaging", "notes"]);
  const status = referralStatus(state);
  const pending = status === "pending";
  const block = approveBlock(state);
  const included = state.grantedSections.length + (counselingGranted(state) ? 1 : 0);
  const signer = receiptSigner(state.teeReceipt);
  const seconds = state.summaryLatencyMs && state.summaryLatencyMs > 0 ? (state.summaryLatencyMs / 1000).toFixed(1) : "";
  const sessionIds = [state.shareId, state.secondShareId, state.deidShareId].filter((id): id is string => Boolean(id));

  useEffect(() => {
    let cancelled = false;
    if (sessionIds.length === 0) {
      queueMicrotask(() => {
        if (!cancelled) setPendingOnChain(0);
      });
      return () => {
        cancelled = true;
      };
    }
    fetch("/api/visitor", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then(async (body: { accountId?: string } | null) => {
        if (!body?.accountId || cancelled) return;
        const ids = await pendingForSession(body.accountId, sessionIds);
        if (!cancelled) setPendingOnChain(ids.length);
      })
      .catch(() => {
        if (!cancelled) setPendingOnChain(null);
      });
    return () => {
      cancelled = true;
    };
  }, [state.shareId, state.secondShareId, state.deidShareId]);

  return (
    <div>
      <PageHead
        eyebrow="Patient"
        title={state.referralSent ? "Requests to share your" : "Requests"}
        mark={state.referralSent ? "records" : undefined}
        what="This page lists requests to share Maya's records."
        can="Read who is asking and why, then remove sections, set an end date, read the summary, and approve or deny with your signature."
        lede={state.referralSent ? "" : "No request has arrived yet."}
        state={state}
      />
      <PatientSetup />
      {!state.referralSent ? (
        <div data-testid="inbox-empty" className="c2-sec">
          <p className="c2-lede">Riverbend Family Clinic has not sent a referral yet. When it does, the sections show up here.</p>
          <Link href="/clinic" className="c2-btn sm" style={{ marginTop: 12 }}>
            Go to Riverbend Family Clinic
          </Link>
        </div>
      ) : (
        <article data-testid="requests-card">
          <div className="c2-cols">
            <Section index="A" title="Include" aside={`${included} of 6`} delay={1}>
              <div className={pending ? "c2-sel" : "c2-sel is-locked"} id="sections">
                {SECTION_KEYS.map((key: SectionKey) => {
                  const on = state.grantedSections.includes(key);
                  return (
                    <button key={key} type="button" className={on ? "on" : "out"} disabled={!pending} aria-pressed={on} onClick={() => toggleGranted(key)}>
                      <span className="bx">
                        <Tick />
                      </span>
                      {on ? SECTION_LABEL[key] : <span className="struck">{SECTION_LABEL[key]}</span>}
                    </button>
                  );
                })}
                <button
                  type="button"
                  data-testid="grant-counseling"
                  className={counselingGranted(state) ? "on" : "out"}
                  disabled={!pending}
                  aria-pressed={state.grantCounseling}
                  onClick={toggleGrantCounseling}
                >
                  <span className="bx">
                    <Tick />
                  </span>
                  {counselingGranted(state) ? "Counseling" : <span className="struck">Counseling</span>}
                </button>
              </div>
              <p className="c2-lede" style={{ fontSize: 13.5 }}>
                {pending ? "Tap a box to leave it out. Counseling is not needed for cardiology." : "Locked after approval. These sections cannot be changed."}
              </p>
            </Section>
            <Section index="B" title="Expires" aside={`Through ${expiryDate(state.expiryDays)}, Bangkok`} delay={2}>
              <div className={pending ? "c2-seg" : "c2-seg is-locked"}>
                {([7, 30, 90] as const).map((days) => (
                  <button key={days} type="button" data-testid={`expiry-${days}`} className={state.expiryDays === days ? "on" : ""} disabled={!pending} aria-pressed={state.expiryDays === days} onClick={() => setExpiry(days)}>
                    {days} days
                  </button>
                ))}
              </div>
            </Section>
          </div>
          <Section
            index="C"
            title={
              <>
                Summary, made inside a{" "}
                <Tip label="Sealed AI" body="The summary runs on NEAR AI Cloud inside a verified TEE, and our server passes the selected text to it. Maya reads it before she approves.">
                  NEAR AI Cloud TEE
                </Tip>
              </>
            }
            aside="Maya reads this before she approves"
            delay={3}
          >
            {state.teeStatus === "green" && state.summaryReady ? (
              <div className="c2-navy c2-summary" data-testid="summary-preview">
                <div className="c2-row" style={{ justifyContent: "space-between" }}>
                  <span className="c2-lab">Summary</span>
                  <Tag tone="ok">Verified</Tag>
                </div>
                <IdentifierBestEffort verified />
                <p className="txt">{summaryParagraph(state)}</p>
                <div className="bar">
                  <span>
                    Signature{" "}
                    <Tip up label="Sealed signature" body="This mark means the sealed server signed the summary. Approve stays off unless this exact mark is present.">
                      <b>{state.teeNote || "provider_tee"}</b>
                    </Tip>
                  </span>
                  <span>
                    Model <b>{MODEL_ID}</b>
                  </span>
                  {seconds ? (
                    <span>
                      Round trip <b>{seconds} s</b>
                    </span>
                  ) : null}
                  <Tip up label="One-time check" body="A nonce is a random number used once. It proves this check is fresh, not a replay of an old one.">
                    Nonce fresh
                  </Tip>
                  <Tip up label="On NEAR" body="A public record of who shared what, and when. It stores ids, hashes, and times. It does not store the chart itself.">
                    Logged on chain
                  </Tip>
                  {signer ? (
                    <span>
                      Signer <b>{shortId(signer, 8, 10)}</b>
                    </span>
                  ) : null}
                  <Link href="/verification" data-testid="open-verified">
                    See all checks
                  </Link>
                </div>
              </div>
            ) : (
              <div className="c2-navy c2-summary">
                <div className="c2-row" style={{ justifyContent: "space-between" }}>
                  <span className="c2-lab">Summary</span>
                  <Tag tone={state.teeStatus === "red" ? "bad" : "qmut"}>{state.teeStatus === "red" ? "Blocked" : "Not run"}</Tag>
                </div>
                <p className="txt">The summary appears here after the attested model writes it. Approve stays off until the signature is provider_tee.</p>
                {state.teeStatus === "red" ? (
                  <p className="bar" data-testid="verified-red">
                    Verified panel is red. {state.teeNote}
                  </p>
                ) : null}
              </div>
            )}
          </Section>
          {status === "active" ? (
            <div data-testid="approved-banner">
              <div className="c2-receipt">
                <Tag tone="ok">Approved</Tag>
                {state.consentTx ? (
                  <a href={txHref(state.consentTx)} target="_blank" rel="noreferrer">
                    {shortId(state.consentTx, 8, 6)}
                  </a>
                ) : null}
                {state.approvedAtMs ? <span>{bangkok(state.approvedAtMs)} Bangkok</span> : null}
              </div>
              <Section index="D" title="Second doctor" aside={`${PEOPLE.sofia} · ${ORG.second}`} delay={4}>
                <div id="second-opinion">
                <p className="c2-body">This step is optional. Dr. Sofia Reyes at Northgate Heart Institute can read a copy for a set number of days, and the reply comes back to Maya.</p>
                {state.secondSent ? (
                  <div className="c2-receipt" data-testid="second-sent">
                    <Tag tone="sec2">Sent</Tag>
                    {state.secondTx ? (
                      <a href={txHref(state.secondTx)} target="_blank" rel="noreferrer">
                        {shortId(state.secondTx, 8, 6)}
                      </a>
                    ) : null}
                    {state.secondAtMs ? <span>{bangkok(state.secondAtMs)} Bangkok</span> : null}
                    <Btn small href="/reyes">
                      Open Dr. Reyes <Arrow />
                    </Btn>
                  </div>
                ) : (
                  <>
                    <div className="c2-sel" style={{ marginTop: 12 }}>
                      {state.grantedSections.map((key) => {
                        const on = secondPicks.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            className={on ? "on" : "out"}
                            aria-pressed={on}
                            onClick={() =>
                              setSecondPicks((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
                            }
                          >
                            <span className="bx">
                              <Tick />
                            </span>
                            {on ? SECTION_LABEL[key] : <span className="struck">{SECTION_LABEL[key]}</span>}
                          </button>
                        );
                      })}
                    </div>
                    <div className="c2-seg" style={{ marginTop: 12 }}>
                      {([7, 30, 90] as const).map((days) => (
                        <button
                          key={days}
                          type="button"
                          className={state.secondExpiry === days ? "on" : ""}
                          aria-pressed={state.secondExpiry === days}
                          onClick={() => setSecondExpiry(days)}
                        >
                          {days} days
                        </button>
                      ))}
                    </div>
                    <div className="c2-row" style={{ marginTop: 14 }}>
                      <Btn
                        testId="send-second"
                        disabled={secondPicks.filter((key) => state.grantedSections.includes(key)).length === 0}
                        onClick={() => setWallet("create_share")}
                      >
                        Send to a second doctor <Arrow />
                      </Btn>
                    </div>
                  </>
                )}
                </div>
              </Section>
              <div className="c2-row" style={{ marginTop: 16 }}>
                <Btn tone="danger" onClick={() => setWallet("revoke_share")}>
                  Revoke
                </Btn>
              </div>
            </div>
          ) : null}
          {pending ? (
            <div className="c2-row c2-rv" style={{ ["--d" as string]: 4, marginTop: 22 }}>
              {state.teeStatus !== "green" ? (
                <Btn testId="run-summary" guide="summary" disabled={Boolean(activity)} onClick={runSummary}>
                  {activity ? "Checking the TEE" : "Check with secure AI"} <Arrow />
                </Btn>
              ) : (
                <Btn testId="approve" guide="approve" disabled={Boolean(block)} onClick={() => setWallet("approve_share")}>
                  Approve and share <Arrow />
                </Btn>
              )}
              <Btn tone="danger" testId="decline" onClick={() => setWallet("decline_share")}>
                Deny
              </Btn>
              {pendingOnChain != null ? (
                <span className="mono" data-testid="pending-on-chain" style={{ color: "var(--faint)", fontSize: 11.5 }}>
                  On-chain inbox for this account: {pendingOnChain} pending.
                </span>
              ) : null}
              <span className="mono" style={{ color: "var(--faint)", fontSize: 11.5 }}>
                {block ?? "Your signature is what lets the hospital open it. Approve stays off until the sealed summary is signed."}
              </span>
            </div>
          ) : null}
        </article>
      )}
      {wallet ? (
        <WalletModal
          method={wallet}
          onCancel={() => setWallet(null)}
          onSign={() => {
            if (wallet === "approve_share") return approve();
            if (wallet === "decline_share") return decline();
            if (wallet === "revoke_share") return revoke("referral");
            if (wallet === "create_share") return sendSecond(secondPicks);
          }}
        />
      ) : null}
    </div>
  );
}

export function InboxScreen({ titleAs: _titleAs = "h1" }: { titleAs?: "h1" | "h2" }) {
  return <RequestsScreen />;
}
