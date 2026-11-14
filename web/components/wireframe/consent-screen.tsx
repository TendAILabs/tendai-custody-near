"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { COUNSELING_BODY, ORG, PEOPLE, SECTION_BODY, SECTION_KEYS, SECTION_LABEL, type WalletMethod } from "@/lib/fixtures";
import { approveBlock, counselingGranted, expiryDate, referralStatus, summaryParagraph } from "@/lib/story";
import { useStory } from "@/lib/story-context";
import { CipherContrast, PrivacyStrip } from "./privacy-strip";
import { Button, Card, Chip, EmptyState, PageHeader, Pill } from "./ui";
import { VerifiedDrawer } from "./verified-drawer";
import { WalletModal } from "./wallet-modal";

export function ConsentScreen({
  titleAs = "h1",
  initialDrawer = false,
}: {
  titleAs?: "h1" | "h2";
  initialDrawer?: boolean;
}) {
  const { state, toggleGranted, toggleGrantCounseling, setExpiry, toggleReadOnly, runSummary, approve, decline } = useStory();
  const [drawer, setDrawer] = useState(initialDrawer);
  const [wallet, setWallet] = useState<WalletMethod | null>(null);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const status = referralStatus(state);
  const pending = status === "pending";
  const block = approveBlock(state);

  return (
    <div className="space-y-5">
      <PageHeader
        titleAs={titleAs}
        eyebrow="Maya · consent"
        title="Review the referral"
        lede="Decrypted on this phone. Untick what cardiology does not need, then approve."
        actions={
          <Link href="/patient" className="text-sm font-semibold text-[var(--teal)]">
            Back to inbox
          </Link>
        }
      />

      {drawer ? <VerifiedDrawer onClose={closeDrawer} /> : null}

      {!drawer && !state.referralSent ? (
        <Card testId="consent-empty">
          <EmptyState title="Nothing to approve" body="Send the referral from Riverbend Family Clinic, or use You are Maya on the landing page." />
          <Link href="/clinic" className="text-sm font-semibold text-[var(--teal)]">
            Riverbend Family Clinic
          </Link>
        </Card>
      ) : null}

      {!drawer && state.referralSent ? (
        <>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Who</p>
            <p className="mt-1 text-xl font-semibold">{PEOPLE.lena}</p>
            <p className="text-sm text-[var(--muted)]">
              {ORG.clinic} to {ORG.hospital}
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Why, decrypted on this phone</p>
            <p className="mt-1 text-sm leading-6">{state.purpose}</p>
            <div className="mt-3">
              <Pill tone={status === "active" ? "approved" : status === "revoked" ? "revoked" : status === "declined" ? "expired" : "pending"}>
                {status}
              </Pill>
            </div>
          </Card>

          <fieldset disabled={!pending} className="space-y-4 disabled:opacity-60">
            <Card title="Sections Maya grants">
              <ul className="space-y-3">
                {SECTION_KEYS.map((key) => (
                  <li key={key}>
                    <label className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 accent-[var(--teal)]"
                        checked={state.grantedSections.includes(key)}
                        onChange={() => toggleGranted(key)}
                      />
                      <span>
                        <span className="font-semibold">{SECTION_LABEL[key]}</span>
                        <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{SECTION_BODY[key]}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {state.grantedSections.includes("notes") ? (
                <label className="mt-3 flex gap-2 rounded-[8px] bg-[var(--wait-bg)] p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    data-testid="grant-counseling"
                    checked={state.grantCounseling}
                    onChange={toggleGrantCounseling}
                  />
                  <span>
                    <span className="font-semibold">Include 2021 counseling note</span>
                    <span className="mt-1 block text-xs leading-5">{COUNSELING_BODY}</span>
                  </span>
                </label>
              ) : null}
            </Card>
            <Card title="Expiry and access">
              <div className="flex flex-wrap gap-2">
                {([7, 30, 90] as const).map((days) => (
                  <Chip key={days} pressed={state.expiryDays === days} disabled={!pending} testId={`expiry-${days}`} onClick={() => setExpiry(days)}>
                    {days} days
                  </Chip>
                ))}
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">Through {expiryDate(state.expiryDays)}.</p>
              <div className="mt-3">
                <Chip pressed={state.readOnly} disabled={!pending} onClick={toggleReadOnly} testId="read-only">
                  {state.readOnly ? "Read only: on" : "Read only: off"}
                </Chip>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                Read only means the hospital cannot edit the chart. A consult note is a new message back to Maya.
              </p>
            </Card>
          </fieldset>

          {pending && !state.summaryReady ? (
            <Button tone="solid" testId="run-summary" onClick={runSummary}>
              Run TEE summary
            </Button>
          ) : null}

          {state.summaryReady ? (
            <Card
              testId="summary-preview"
              extra={
                <span className="flex flex-wrap items-center justify-end gap-2">
                  <span className="text-xs text-[var(--muted)]">Identifier check is best effort</span>
                  <Pill tone="verified">TEE verified</Pill>
                </span>
              }
              title="Summary"
            >
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  data-testid="open-verified"
                  onClick={() => setDrawer(true)}
                  className="inline-flex h-6 items-center rounded-[4px] bg-[var(--good-bg)] px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--good)]"
                >
                  Verified
                </button>
              </div>
              <p className="text-sm leading-6">{summaryParagraph(state)}</p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                {counselingGranted(state) ? "Counseling is still in the draft." : "Counseling stays on Maya's phone."} Model
                id z-ai/glm-5.3-flash. Signature {state.teeNote || "not verified"}. Approve stays off unless this is provider_tee.
              </p>
            </Card>
          ) : null}

          <PrivacyStrip />
          <CipherContrast />

          {status === "active" ? (
            <Card testId="approved-banner">
              <Pill tone="approved">Approved</Pill>
              <p className="mt-2 text-sm">
                Signed with the demo key. {ORG.hospital} can open this share. Tx {state.consentTx}.
              </p>
              <Link href="/patient/timeline" className="mt-2 inline-block text-sm font-semibold text-[var(--teal)]">
                Custody timeline
              </Link>
            </Card>
          ) : null}
          {status === "declined" ? (
            <Card testId="declined-banner">
              <Pill tone="expired">Declined</Pill>
              <p className="mt-2 text-sm">St. Aster Hospital cannot open this share.</p>
            </Card>
          ) : null}
          {status === "revoked" ? (
            <Card>
              <Pill tone="revoked">Revoked</Pill>
              <p className="mt-2 text-sm">Revoked at {state.revokedAtLabel}.</p>
            </Card>
          ) : null}

          {pending ? (
            <div className="flex flex-wrap gap-2">
              {block ? <p className="w-full text-xs text-[var(--muted)]">{block}</p> : null}
              <Button tone="solid" testId="approve" disabled={Boolean(block)} onClick={() => setWallet("approve_share")}>
                Approve
              </Button>
              <Button tone="danger" testId="decline" onClick={() => setWallet("decline_share")}>
                Deny
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {wallet ? (
        <WalletModal
          method={wallet}
          onCancel={() => setWallet(null)}
          onSign={() => {
            if (wallet === "approve_share") return approve();
            if (wallet === "decline_share") return decline();
          }}
        />
      ) : null}
    </div>
  );
}
