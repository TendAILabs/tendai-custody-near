"use client";

import { useEffect, useState } from "react";
import { ORG, PEOPLE, SECTION_LABEL, type WalletMethod } from "@/lib/fixtures";
import { loadCustody, type ChainEvent } from "@/lib/near/custody";
import { loadDemoConfig } from "@/lib/relay/flow";
import { txUrl } from "@/lib/wallet/network";
import { counselingGranted, expiryDate, referralStatus, sectionList } from "@/lib/story";
import type { ShareTarget } from "@/lib/story";
import { useStory } from "@/lib/story-context";
import { Btn, PageHead, Section, Tag } from "./c2";
import { WalletModal } from "./wallet-modal";

function plainEvent(kind: string): string {
  const labels: Record<string, string> = {
    record_created: "Chart created",
    referral_requested: "Referral sent",
    share_consented: "Share approved",
    share_declined: "Share declined",
    share_opened: "Share opened",
    share_revoked: "Access revoked",
    reply_submitted: "Reply recorded",
    share_created: "Share created",
  };
  return labels[kind] ?? kind.replaceAll("_", " ");
}

function clock(events: ChainEvent[], kind: string): string {
  const found = events.find((event) => event.kind === kind);
  if (!found) return "";
  try {
    const ms = Number(BigInt(found.at_ns) / BigInt(1_000_000));
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  } catch {
    return "";
  }
}

export function SharingScreen() {
  const { state, revoke, revokeAll } = useStory();
  const [wallet, setWallet] = useState<null | { method: WalletMethod; target: ShareTarget }>(null);
  const canRevokeAll =
    (state.referralSent && state.consentStatus !== "declined" && !state.revoked.referral) ||
    (state.secondSent && !state.revoked.second) ||
    (state.deidSent && !state.revoked.deid);
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const status = referralStatus(state);
  const grantedNames = state.grantedSections.map((key) => SECTION_LABEL[key]);
  if (counselingGranted(state)) grantedNames.push("Counseling");

  useEffect(() => {
    if (!state.recordId) return;
    let cancel = false;
    loadDemoConfig()
      .then((config) => loadCustody(config.contractId, state.recordId as string))
      .then((loaded) => {
        if (!cancel) setEvents(loaded.events);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [state.recordId, state.consentTx, state.hospitalOpenTx, state.revokeTx, state.secondTx, state.deidTx]);

  const opened = events.find((event) => event.kind === "share_opened");

  return (
    <div>
      <PageHead
        eyebrow="Patient"
        title="Who can open your"
        mark="records"
        what="This page lists every place that can still open a share."
        can="You can revoke one share or all of them. Revoke stops future opens, and it cannot erase copies already downloaded."
        state={state}
        bad={state.revoked.referral || state.revoked.second || state.revoked.deid}
      />
      <div className="c2-sec c2-rv" data-testid="sharing-list" style={{ ["--d" as string]: 1 }}>
        <div className="c2-hh">
          <span>Holder</span>
          <span>Scope</span>
          <span>Granted</span>
          <span>Expires</span>
          <span>Last opened</span>
          <span />
        </div>
        <div className="c2-hold" style={{ ["--c" as string]: "var(--h-clinic)" }} data-testid="share-row-clinic">
          <div className="who">
            <b>{ORG.clinic}</b>
            <span>{PEOPLE.lena} · Source record</span>
          </div>
          <div className="scope">All six sections</div>
          <div className="m">Source</div>
          <div className="m">No expiry</div>
          <div className="m">Held at the clinic</div>
          <Tag tone="solid">Source</Tag>
        </div>
        {state.referralSent ? (
          <div className={status === "revoked" ? "c2-hold rev" : "c2-hold"} style={{ ["--c" as string]: "var(--h-hosp)" }} data-testid="share-row-hospital">
            <div className="who">
              <b>{ORG.hospital}</b>
              <span>{PEOPLE.arjun} · Referral</span>
            </div>
            <div className="scope">{status === "pending" ? sectionList(state.requestedSections) : grantedNames.join(", ")}</div>
            <div className="m">{status === "pending" ? "Waiting" : clock(events, "share_consented") || "Approved"}</div>
            <div className="m">{status === "pending" ? "Set on approve" : status === "revoked" ? "Revoked" : expiryDate(state.expiryDays)}</div>
            <div className="m">{opened ? clock(events, "share_opened") || "Opened" : "Not opened"}</div>
            {status === "revoked" ? (
              <Tag tone="bad">Revoked</Tag>
            ) : status === "pending" || status === "active" ? (
              <Btn small tone="danger" testId="revoke-referral" guide="revoke" onClick={() => setWallet({ method: "revoke_share", target: "referral" })}>
                Revoke
              </Btn>
            ) : (
              <Tag tone="q">{status === "declined" ? "Denied" : "Pending"}</Tag>
            )}
          </div>
        ) : null}
        {state.secondSent ? (
          <div className={state.revoked.second ? "c2-hold rev" : "c2-hold"} style={{ ["--c" as string]: "var(--h-2nd)" }} data-testid="share-row-reyes">
            <div className="who">
              <b>{ORG.second}</b>
              <span>{PEOPLE.sofia} · Second opinion</span>
            </div>
            <div className="scope">Same sections Maya sent</div>
            <div className="m">{clock(events, "share_created") || "Sent"}</div>
            <div className="m">{state.revoked.second ? "Revoked" : expiryDate(state.secondExpiry)}</div>
            <div className="m">{state.secondOpened ? "Opened" : "Not opened"}</div>
            {state.revoked.second ? (
              <Tag tone="bad">Revoked</Tag>
            ) : (
              <Btn small tone="danger" testId="revoke-second" onClick={() => setWallet({ method: "revoke_share", target: "second" })}>
                Revoke
              </Btn>
            )}
          </div>
        ) : null}
        {state.deidSent ? (
          <div className={state.revoked.deid ? "c2-hold rev" : "c2-hold"} style={{ ["--c" as string]: "var(--h-app)" }} data-testid="share-row-pulse">
            <div className="who">
              <b>{ORG.app}</b>
              <span>De-identified app copy</span>
            </div>
            <div className="scope">Stripped copy</div>
            <div className="m">Sent</div>
            <div className="m">No expiry</div>
            <div className="m">{state.deidOpened ? "Opened" : "Not opened"}</div>
            {state.revoked.deid ? <Tag tone="bad">Revoked</Tag> : <Tag tone="app">De-identified</Tag>}
          </div>
        ) : null}
      </div>
      <div className="c2-row" style={{ marginTop: 16, alignItems: "center" }}>
        <Btn
          small
          tone="danger"
          testId="revoke-all"
          disabled={!canRevokeAll}
          onClick={() => setWallet({ method: "revoke_all_for_record", target: "referral" })}
        >
          Revoke all
        </Btn>
        <span className="c2-lede" style={{ margin: 0 }}>
          Stops every future open. It cannot erase copies already downloaded.
        </span>
        {state.revokeTx ? (
          <a className="c2-btn" href={txUrl(state.revokeTx)} target="_blank" rel="noreferrer">
            View the revoke transaction
          </a>
        ) : null}
      </div>
      <div className="c2-cols eq" style={{ marginTop: 6 }}>
        <Section index="A" title={state.revoked.referral ? "Revoke recorded" : "Recent events"} aside={events.length ? `${events.length} events` : "None yet"} delay={2}>
          <div className="c2-navy c2-term">
            {events.length === 0 ? <span className="dim">No custody events yet.</span> : null}
            {events.slice(-4).map((event) => (
              <span key={`${event.kind}-${event.at_ns}`}>
                <span className="dim">{clock([event], event.kind) || "event"}</span> {plainEvent(event.kind)}
                <br />
              </span>
            ))}
          </div>
        </Section>
        <Section index="B" title="What revoke does" delay={3}>
          <div className="c2-nrow">
            <span className="n">+</span>
            <div>
              <b>Stops the next open</b>
              <p>The hospital cannot open the chart again.</p>
            </div>
          </div>
          <div className="c2-nrow">
            <span className="n">!</span>
            <div>
              <b>Does not erase a saved copy</b>
              <p>A copy already downloaded stays where it is.</p>
            </div>
          </div>
        </Section>
      </div>
      {wallet ? (
        <WalletModal
          method={wallet.method}
          onCancel={() => setWallet(null)}
          onSign={() => (wallet.method === "revoke_all_for_record" ? revokeAll() : revoke(wallet.target))}
        />
      ) : null}
    </div>
  );
}
