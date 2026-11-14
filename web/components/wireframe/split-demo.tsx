"use client";

import { Lock, LockOpen } from "lucide-react";
import { ORG, PEOPLE, SECTION_BODY, SECTION_LABEL } from "@/lib/fixtures";
import { counselingGranted, referralStatus } from "@/lib/story";
import { useStory } from "@/lib/story-context";
import { RequestsScreen } from "./inbox-screen";
import { Button, Pill } from "./ui";

export function SplitDemo() {
  const { state, seedMaya, openHospital } = useStory();
  const status = referralStatus(state);
  const unlocked = status === "active" && state.hospitalOpened && !state.revoked.referral;
  const locked = !state.referralSent || status === "pending" || status === "declined" || state.revoked.referral;

  return (
    <div className="space-y-4" data-testid="split-demo">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--teal)]">Guided demo</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Maya and the hospital</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Approve on the phone unlocks the record on the right. Revoke locks it. The next open shows ERR_REVOKED.
          </p>
        </div>
        <Button tone="solid" testId="start-demo" onClick={seedMaya}>
          Cue Maya&apos;s request
        </Button>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[390px_1fr]">
        <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--bg)] p-3">
          <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Maya · 390 px</p>
          <RequestsScreen embedded />
        </div>
        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {PEOPLE.arjun} · {ORG.hospital}
              </p>
              <h2 className="text-xl font-semibold">St. Aster Hospital</h2>
            </div>
            {unlocked ? (
              <Pill tone="opened">
                <LockOpen size={12} aria-hidden="true" /> Unlocked
              </Pill>
            ) : (
              <Pill tone={state.revoked.referral ? "revoked" : "pending"}>
                <Lock size={12} aria-hidden="true" /> {state.revoked.referral ? "Locked" : "Waiting"}
              </Pill>
            )}
          </div>
          {locked && !state.revoked.referral ? (
            <p className="mt-4 text-sm leading-6">Locked until Maya approves. The chart is not on this screen.</p>
          ) : null}
          {status === "active" && !state.revoked.referral ? (
            <div className="mt-4">
              <Button tone="solid" testId="hospital-open" onClick={openHospital}>
                Request open
              </Button>
            </div>
          ) : null}
          {state.revoked.referral ? (
            <div className="mt-4 space-y-3">
              <Button tone="solid" testId="hospital-open" onClick={openHospital}>
                Request open
              </Button>
              {state.lastOpenError === "ERR_REVOKED" ? (
                <div data-testid="hospital-error" className="rounded-[8px] bg-[var(--bad-bg)] p-3 text-sm">
                  <p className="font-semibold">Access revoked by the patient at {state.revokedAtLabel}.</p>
                  <p className="mt-1">request_open failed: ERR_REVOKED</p>
                  <p className="mt-2 text-xs leading-5">
                    Revoking stops future access through TendAI Custody. It cannot erase a copy someone already saved.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">Tap Request open to see the block.</p>
              )}
            </div>
          ) : null}
          {unlocked ? (
            <div className="mt-4 space-y-2" data-testid="hospital-chart">
              <p className="text-sm font-semibold">Opened, logged on NEAR</p>
              <p className="text-sm leading-6">
                {counselingGranted(state)
                  ? "Counseling is still in the artifact."
                  : "Minimum necessary. The 2021 counseling visit was left out."}
              </p>
              {state.grantedSections.map((key) => (
                <div key={key} className="rounded-[8px] bg-[var(--bg)] p-3 text-sm">
                  <p className="font-semibold">{SECTION_LABEL[key]}</p>
                  <p className="mt-1 text-[var(--muted)]">{SECTION_BODY[key]}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
