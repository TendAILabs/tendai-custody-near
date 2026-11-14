"use client";

import Link from "next/link";
import { useState } from "react";
import { COUNSELING_BODY, DEFAULT_CONSULT, ORG, PEOPLE, SECTION_BODY, SECTION_KEYS, SECTION_LABEL, type WalletMethod } from "@/lib/fixtures";
import { counselingGranted, referralStatus } from "@/lib/story";
import { useStory } from "@/lib/story-context";
import { PhoneApp } from "./phone-app";
import { Button, EmptyState, Pill } from "./ui";
import { WalletModal } from "./wallet-modal";

const TITLES: Record<string, { source: string; type: string; date: string }> = {
  riverbend: { source: ORG.clinic, type: "Chart", date: "2026-11-12" },
  staster: { source: ORG.hospital, type: "Consult note", date: "2026-11-12" },
  reyes: { source: ORG.second, type: "Second opinion", date: "2026-11-12" },
};

export function RecordDetail({ id }: { id: string }) {
  const { state, noteTransfer, setSecondExpiry, sendSecond } = useStory();
  const [sheet, setSheet] = useState<"menu" | "second" | "transfer" | "deid" | null>(null);
  const [wallet, setWallet] = useState<WalletMethod | null>(null);
  const meta = TITLES[id];
  const status = referralStatus(state);
  const holders = [
    ORG.clinic,
    status === "active" && !state.revoked.referral ? ORG.hospital : null,
    state.secondSent && !state.revoked.second ? ORG.second : null,
    state.deidSent && !state.revoked.deid ? ORG.app : null,
  ].filter((name): name is string => Boolean(name));

  if (!meta) {
    return (
      <PhoneApp>
        <EmptyState title="Unknown record" body="Go back to the list." />
      </PhoneApp>
    );
  }

  return (
    <PhoneApp>
      <div className="space-y-4" data-testid="record-detail">
        <Link href="/patient/records" className="text-sm font-semibold text-[var(--teal)]">
          My records
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--teal)]">{meta.type}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{meta.source}</h1>
          <p className="text-sm text-[var(--muted)]">{meta.date} · decrypted on this device</p>
        </div>
        {id === "riverbend" ? (
          <ul className="space-y-2">
            {SECTION_KEYS.map((key) => (
              <li key={key} className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-3 text-sm leading-6">
                <p className="font-semibold">{SECTION_LABEL[key]}</p>
                <p className="mt-1 text-[var(--muted)]">{SECTION_BODY[key]}</p>
                {key === "notes" ? <p className="mt-2 text-xs">{COUNSELING_BODY}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {id === "staster" ? (
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-3 text-sm leading-6">
            {state.consultSent ? state.consultNote || DEFAULT_CONSULT : "The consult note is not here yet."}
          </div>
        ) : null}
        {id === "reyes" ? (
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-3 text-sm leading-6">
            {state.secondReply || "No reply yet."} Riverbend does not see this.
          </div>
        ) : null}
        {id === "riverbend" ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Who has this</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {holders.map((name) => (
                <Pill key={name} tone="neutral">
                  {name}
                </Pill>
              ))}
            </div>
            {!counselingGranted(state) ? <p className="mt-2 text-xs text-[var(--muted)]">Counseling stays on this phone.</p> : null}
          </div>
        ) : null}
        <Button tone="solid" testId="open-share" onClick={() => setSheet(sheet ? null : "menu")}>
          {sheet ? "Close share" : "Share"}
        </Button>
        {sheet === "menu" ? (
          <div data-testid="share-sheet" className="space-y-2 rounded-[8px] border border-dashed border-[var(--line)] p-3">
            <Button testId="share-transfer" onClick={() => setSheet("transfer")}>
              Hospital transfer
            </Button>
            <Button testId="share-second" disabled={state.consentStatus !== "active" && !state.secondSent} onClick={() => setSheet("second")}>
              Second opinion
            </Button>
            <Button onClick={() => setSheet("deid")}>De-identified app copy</Button>
          </div>
        ) : null}
        {sheet === "transfer" ? (
          <div className="rounded-[8px] bg-[var(--bg)] p-3 text-sm leading-6">
            <Pill tone="soon">Coming soon</Pill>
            <p className="mt-2">Transfer to {ORG.lakeside} is not part of this story. Recording the intent does not create a share.</p>
            {state.transferStub ? (
              <p className="mt-2" data-testid="transfer-noted">
                Intent noted. No share was created.
              </p>
            ) : (
              <div className="mt-2">
                <Button testId="note-transfer" onClick={noteTransfer}>
                  Record this intent
                </Button>
              </div>
            )}
          </div>
        ) : null}
        {sheet === "second" ? (
          <div className="space-y-2 rounded-[8px] bg-[var(--bg)] p-3 text-sm">
            <p className="font-semibold">
              {PEOPLE.sofia}, {ORG.second}
            </p>
            <p className="text-xs text-[var(--muted)]">Read only. 7 days. The reply comes back to you.</p>
            {state.secondSent ? (
              <p data-testid="second-sent">
                Sent. Tx {state.secondTx}.{" "}
                <Link className="font-semibold text-[var(--teal)]" href="/reyes">
                  Dr. Reyes
                </Link>
              </p>
            ) : (
              <Button
                tone="solid"
                testId="send-second"
                onClick={() => {
                  setSecondExpiry(7);
                  setWallet("create_share");
                }}
              >
                Send second opinion
              </Button>
            )}
          </div>
        ) : null}
        {sheet === "deid" ? (
          <div className="rounded-[8px] bg-[var(--bg)] p-3 text-sm leading-6">
            <Pill tone="deid">De-identified</Pill>
            <p className="mt-2">Best effort, with a preview. Names, dates, and IDs are highlighted before anything is sent.</p>
            <Link href="/patient/deid#deid-preview" className="mt-2 inline-block font-semibold text-[var(--teal)]">
              Open the preview
            </Link>
          </div>
        ) : null}
        {wallet ? (
          <WalletModal
            method={wallet}
            onCancel={() => setWallet(null)}
            onSign={() => sendSecond()}
          />
        ) : null}
      </div>
    </PhoneApp>
  );
}
