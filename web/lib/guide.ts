import type { Story } from "./story";

export type GuideRole = "patient" | "clinic" | "hospital" | "proof";

export type GuideStep = {
  n: number;
  label: string;
  href: string;
  actor: string;
  who: string;
  role: GuideRole;
  color: string;
  /** Anchor key for the tour callout. Steps 3 and 5 can move to a closer control. */
  target: "setup" | "send" | "summary" | "open" | "revoke" | "proof";
  doThis: string;
  why: string;
  waiting: string;
};

/** One guided path. Optional extras live in GUIDE_EXTRAS, not in this list. */
export const GUIDE_STEPS: GuideStep[] = [
  {
    n: 1,
    label: "Set up Maya",
    href: "/patient",
    actor: "Maya",
    who: "Now you are Maya Okafor, patient.",
    role: "patient",
    color: "var(--ink)",
    target: "setup",
    doThis: "Press Use the demo server account so Maya has a patient account on this browser before the clinic sends anything.",
    why: "This is the shared demo account for Maya on this browser, and her signature is what lets the hospital open a share later.",
    waiting: "Waiting for a patient account",
  },
  {
    n: 2,
    label: "Riverbend Family Clinic sends the referral",
    href: "/clinic",
    actor: "Riverbend Family Clinic",
    who: "Now you are Dr. Lena Park at Riverbend Family Clinic.",
    role: "clinic",
    color: "var(--h-clinic)",
    target: "send",
    doThis: "Press Send referral at Riverbend Family Clinic, which offers the sections Maya will be asked to approve.",
    why: "The clinic is offering parts of Maya's chart, and nothing is opened by the hospital until she approves.",
    waiting: "Waiting for: Send referral",
  },
  {
    n: 3,
    label: "Maya approves the share",
    href: "/patient",
    actor: "Maya",
    who: "Now you are Maya Okafor, patient.",
    role: "patient",
    color: "var(--ink)",
    target: "summary",
    doThis: "Press Check with secure AI and then Approve and share, so Maya's signature is what lets the hospital open the record.",
    why: "A NEAR AI Cloud TEE writes the summary for Maya to read before she signs, and our server checks that attestation when it asks.",
    waiting: "Waiting for: Approve and share",
  },
  {
    n: 4,
    label: "St. Aster Hospital opens the chart",
    href: "/hospital",
    actor: "St. Aster Hospital",
    who: "Now you are Dr. Mehta at St. Aster Hospital.",
    role: "hospital",
    color: "var(--h-hosp)",
    target: "open",
    doThis: "Press Open chart at the hospital, which writes the open to NEAR before the chart appears.",
    why: "The hospital can open the chart only after Maya's approval, and that open is written to the custody log.",
    waiting: "Waiting for: Open chart",
  },
  {
    n: 5,
    label: "Maya revokes access",
    href: "/patient/sharing",
    actor: "Maya",
    who: "Now you are Maya Okafor, patient.",
    role: "patient",
    color: "var(--ink)",
    target: "revoke",
    doThis: "Press Revoke on the St. Aster Hospital row, which stops later opens and cannot erase a copy someone already downloaded.",
    why: "Revoke stops new opens from this moment on, and a copy the hospital already downloaded can still remain.",
    waiting: "Waiting for: Revoke",
  },
  {
    n: 6,
    label: "The contract check refuses the open",
    href: "/hospital",
    actor: "St. Aster Hospital",
    who: "Now you are Dr. Mehta at St. Aster Hospital.",
    role: "hospital",
    color: "var(--h-hosp)",
    target: "open",
    doThis: "Press Open chart again so the contract refuses the open, and that refusal is not written as a new event.",
    why: "Expiry and revoke are enforced when someone tries to open, and that refusal writes no event because only approval, open, and revoke are logged.",
    waiting: "Waiting for: the refused check",
  },
  {
    n: 7,
    label: "Review the proof",
    href: "/onchain?desk=proof",
    actor: "Proof",
    who: "Now you are looking at the proof.",
    role: "proof",
    color: "var(--sig)",
    target: "proof",
    doThis: "Read the activity log on this page, where approval, open, and revoke are the three events written to NEAR.",
    why: "This is the custody log for the chart in this session, and you can open each event on NEAR testnet.",
    waiting: "Waiting for: the activity log",
  },
];

export const GUIDE_EXTRAS: { label: string; href: string; note: string }[] = [
  {
    label: "Second opinion for Dr. Reyes",
    href: "/patient#second-opinion",
    note: "This extra is optional, and a second doctor gets read-only access for a set number of days.",
  },
  {
    label: "App copy for PulseFit",
    href: "/patient/deid",
    note: "This extra is optional. PulseFit can receive a copy with identifiers removed, and that removal is best effort.",
  },
];

export function guideDone(state: Story, accountReady: boolean): boolean[] {
  return [
    accountReady,
    state.referralSent,
    state.consentStatus === "active",
    state.hospitalOpened,
    state.revoked.referral,
    Boolean(state.blockedAttempt && state.revoked.referral),
    state.proofSeen,
  ];
}

export function guideCurrent(state: Story, accountReady: boolean): number {
  const done = guideDone(state, accountReady);
  const index = done.findIndex((item) => !item);
  return index === -1 ? GUIDE_STEPS.length - 1 : index;
}

export function guideComplete(state: Story, accountReady: boolean): boolean {
  return guideDone(state, accountReady).every(Boolean);
}

export function onGuidePage(pathname: string, href: string): boolean {
  const path = href.split("?")[0].split("#")[0];
  if (path === "/patient") return pathname === "/patient" || pathname === "/patient/consent";
  if (path === "/onchain") return pathname === "/onchain";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function guideDeclined(state: Story, accountReady: boolean): boolean {
  return guideCurrent(state, accountReady) === 2 && state.consentStatus === "declined";
}
