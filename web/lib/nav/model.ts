import { ORG, PEOPLE } from "../fixtures.ts";

export type NavStory = {
  referralSent: boolean;
  consentStatus: "pending" | "active" | "declined";
  hospitalOpened: boolean;
  openCount: number;
  consultSent: boolean;
  secondSent: boolean;
  secondOpened: boolean;
  secondReplySent: boolean;
  deidSent: boolean;
  deidOpened: boolean;
  expiryDays: number;
  revoked: { referral: boolean; second: boolean; deid: boolean };
  blockedAttempt?: boolean;
};

export type WorkspaceId = "patient" | "clinician" | "admin" | "proof";
export type ClinicianOrg = "clinic" | "hospital" | "reyes";

export type NavItem = {
  id: string;
  href: string;
  label: string;
  color: string;
  hint: string;
  test: (path: string, hash: string, search: string) => boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

const under = (href: string) => (path: string) => path === href || path.startsWith(`${href}/`);

function roleParam(search: string): string {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("role") ?? "";
}

function deskParam(search: string): string {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("desk") ?? "";
}

const PATIENT_ITEMS: NavItem[] = [
  {
    id: "patient-home",
    href: "/home?role=patient",
    label: "My dashboard",
    color: "var(--ink)",
    hint: "Open requests, who has access, and the next thing to do.",
    test: (path, _hash, search) => path === "/home" && roleParam(search) === "patient",
  },
  {
    id: "requests",
    href: "/patient",
    label: "Requests",
    color: "var(--ink)",
    hint: "Read a request, then approve or deny it with your signature.",
    test: (path) => path === "/patient" || path.startsWith("/patient/consent"),
  },
  {
    id: "records",
    href: "/patient/records",
    label: "My records",
    color: "var(--ink)",
    hint: "Chart sections held on this device.",
    test: under("/patient/records"),
  },
  {
    id: "access",
    href: "/patient/sharing",
    label: "Who has access",
    color: "var(--red)",
    hint: "Live shares, and where you revoke them.",
    test: under("/patient/sharing"),
  },
  {
    id: "apps",
    href: "/pulsefit",
    label: "Share with an app",
    color: "var(--h-app)",
    hint: "PulseFit's copy. Identifiers are removed on the de-identify preview first, and that removal is best effort.",
    test: under("/pulsefit"),
  },
  {
    id: "activity",
    href: "/patient/timeline",
    label: "My activity",
    color: "var(--sig)",
    hint: "A plain-language log of sends, approvals, opens, and revokes.",
    test: (path) => under("/patient/timeline")(path) || under("/patient/history")(path),
  },
];

const CLINIC_ITEMS: NavItem[] = [
  {
    id: "clinic-home",
    href: "/home?role=clinic",
    label: "Clinic dashboard",
    color: "var(--h-clinic)",
    hint: "Counts for referrals you sent.",
    test: (path, _hash, search) => path === "/home" && roleParam(search) === "clinic",
  },
  {
    id: "referral",
    href: "/clinic",
    label: "New referral",
    color: "var(--h-clinic)",
    hint: "Choose sections and send. Only ids and hashes go on NEAR.",
    test: (path, hash) => path === "/clinic" && hash !== "#sent",
  },
  {
    id: "sent",
    href: "/clinic#sent",
    label: "Sent referrals",
    color: "var(--h-clinic)",
    hint: "Status of each referral, and the hospital's reply.",
    test: (path, hash) => path === "/clinic" && hash === "#sent",
  },
];

const HOSPITAL_ITEMS: NavItem[] = [
  {
    id: "hospital-home",
    href: "/home?role=hospital",
    label: "Hospital dashboard",
    color: "var(--h-hosp)",
    hint: "What is waiting on the patient, and what is ready to open.",
    test: (path, _hash, search) => path === "/home" && roleParam(search) === "hospital",
  },
  {
    id: "incoming",
    href: "/hospital",
    label: "Incoming referrals",
    color: "var(--h-hosp)",
    hint: "Open a chart only after the patient approves.",
    test: (path, hash) => under("/hospital")(path) && hash !== "#reply",
  },
  {
    id: "reply",
    href: "/hospital#reply",
    label: "Consult reply",
    color: "var(--h-hosp)",
    hint: "Send a consult note back to the referring clinic.",
    test: (path, hash) => path === "/hospital" && hash === "#reply",
  },
];

const REYES_ITEMS: NavItem[] = [
  {
    id: "second",
    href: "/reyes",
    label: "Second opinions",
    color: "var(--h-2nd)",
    hint: "Read-only records shared for a set number of days.",
    test: under("/reyes"),
  },
];

const ADMIN_ITEMS: NavItem[] = [
  {
    id: "admin-home",
    href: "/home?role=admin",
    label: "Admin dashboard",
    color: "var(--sig)",
    hint: "Active shares, opens, revokes, and refused opens.",
    test: (path, _hash, search) => path === "/home" && roleParam(search) === "admin",
  },
  {
    id: "audit",
    href: "/audit",
    label: "Access review",
    color: "var(--sig)",
    hint: "Who can still open records, and which organizations are registered.",
    test: under("/audit"),
  },
  {
    id: "onchain",
    href: "/onchain?desk=admin",
    label: "Activity log",
    color: "var(--sig)",
    hint: "Every event for the chart, with export and testnet links.",
    test: (path, _hash, search) => path === "/onchain" && deskParam(search) !== "proof",
  },
  {
    id: "settings",
    href: "/settings",
    label: "Settings",
    color: "var(--ink)",
    hint: "Network, contract, and a reset for this browser.",
    test: under("/settings"),
  },
];

const PROOF_ITEMS: NavItem[] = [
  {
    id: "start",
    href: "/start",
    label: "How we prove it",
    color: "var(--sig)",
    hint: "What runs on NEAR testnet, what runs in the sealed model, and what is simulated.",
    test: under("/start"),
  },
  {
    id: "verification",
    href: "/verification",
    label: "AI check",
    color: "var(--sig)",
    hint: "The summary receipt, and a tampered copy that should be refused.",
    test: under("/verification"),
  },
  {
    id: "proof-log",
    href: "/onchain?desk=proof",
    label: "Activity log",
    color: "var(--sig)",
    hint: "The same custody log, readable without an admin role.",
    test: (path, _hash, search) => path === "/onchain" && deskParam(search) === "proof",
  },
];

const CHOOSER_ITEMS: NavItem[] = [
  {
    id: "choose-patient",
    href: "/home?role=patient",
    label: "Patient",
    color: "var(--ink)",
    hint: "Maya's records, requests, and revoke.",
    test: (path, _hash, search) => path === "/home" && roleParam(search) === "patient",
  },
  {
    id: "choose-clinician",
    href: "/home?role=clinic",
    label: "Clinician",
    color: "var(--h-clinic)",
    hint: "Riverbend Family Clinic, St. Aster Hospital, or Northgate Heart Institute.",
    test: (path, _hash, search) => path === "/home" && (roleParam(search) === "clinic" || roleParam(search) === "hospital"),
  },
  {
    id: "choose-admin",
    href: "/home?role=admin",
    label: "Admin",
    color: "var(--sig)",
    hint: "Access review and the full log.",
    test: (path, _hash, search) => path === "/home" && roleParam(search) === "admin",
  },
  {
    id: "choose-proof",
    href: "/start",
    label: "Proof",
    color: "var(--sig)",
    hint: "What is real in this demo, and the AI receipt.",
    test: (path) => path === "/start",
  },
];

export function menuFor(workspace: WorkspaceId | null, org: ClinicianOrg | null): NavGroup[] {
  if (workspace === "patient") return [{ label: "Patient", items: PATIENT_ITEMS }];
  if (workspace === "clinician" && org === "hospital") return [{ label: "St. Aster Hospital", items: HOSPITAL_ITEMS }];
  if (workspace === "clinician" && org === "reyes") return [{ label: "Northgate Heart Institute", items: REYES_ITEMS }];
  if (workspace === "clinician") return [{ label: "Riverbend Family Clinic", items: CLINIC_ITEMS }];
  if (workspace === "admin") return [{ label: "Admin", items: ADMIN_ITEMS }];
  if (workspace === "proof") return [{ label: "Proof", items: PROOF_ITEMS }];
  return [{ label: "Choose a role", items: CHOOSER_ITEMS }];
}

export const WORKSPACES: { id: WorkspaceId; label: string; href: string }[] = [
  { id: "patient", label: "Patient", href: "/home?role=patient" },
  { id: "clinician", label: "Clinician", href: "/home?role=clinic" },
  { id: "admin", label: "Admin", href: "/home?role=admin" },
  { id: "proof", label: "Proof", href: "/start" },
];

export const CLINICIAN_ORGS: { id: ClinicianOrg; label: string; href: string }[] = [
  { id: "clinic", label: "Riverbend Family Clinic (sends)", href: "/home?role=clinic" },
  { id: "hospital", label: "St. Aster Hospital (receives)", href: "/home?role=hospital" },
  { id: "reyes", label: "Northgate Heart Institute (second opinion)", href: "/reyes" },
];

export type LocatedWorkspace = {
  workspace: WorkspaceId | null;
  org: ClinicianOrg | null;
};

/** null means the page does not choose a role, so the last choice stays. */
export function workspaceForPath(pathname: string, search = ""): LocatedWorkspace | null {
  const role = roleParam(search);
  if (pathname === "/home") {
    if (role === "patient") return { workspace: "patient", org: null };
    if (role === "clinic") return { workspace: "clinician", org: "clinic" };
    if (role === "hospital") return { workspace: "clinician", org: "hospital" };
    if (role === "admin") return { workspace: "admin", org: null };
    if (role === "proof") return { workspace: "proof", org: null };
    return { workspace: null, org: null };
  }
  if (pathname.startsWith("/patient") || pathname.startsWith("/pulsefit")) return { workspace: "patient", org: null };
  if (pathname.startsWith("/clinic")) return { workspace: "clinician", org: "clinic" };
  if (pathname.startsWith("/hospital")) return { workspace: "clinician", org: "hospital" };
  if (pathname.startsWith("/reyes")) return { workspace: "clinician", org: "reyes" };
  if (pathname.startsWith("/audit") || pathname.startsWith("/settings")) return { workspace: "admin", org: null };
  if (pathname.startsWith("/start") || pathname.startsWith("/verification")) return { workspace: "proof", org: null };
  if (pathname.startsWith("/onchain")) {
    return deskParam(search) === "proof" ? { workspace: "proof", org: null } : { workspace: "admin", org: null };
  }
  return null;
}

export function youAre(workspace: WorkspaceId | null, org: ClinicianOrg | null): string | null {
  if (workspace === "patient") return "You are: Maya Okafor, patient. Fictional.";
  if (workspace === "clinician" && org === "hospital") return "You are: Dr. Arjun Mehta, St. Aster Hospital.";
  if (workspace === "clinician" && org === "reyes") return "You are: Dr. Sofia Reyes, Northgate Heart Institute.";
  if (workspace === "clinician") return "You are: Dr. Lena Park, Riverbend Family Clinic.";
  if (workspace === "admin") return "You are: compliance reviewer. Read only.";
  return null;
}

export const WHO: { name: string; place: string; line: string }[] = [
  {
    name: PEOPLE.maya,
    place: "Patient",
    line: "She decides what is shared in this fictional story, and she can revoke it later.",
  },
  {
    name: PEOPLE.lena,
    place: ORG.clinic,
    line: "She sends the referral from Riverbend Family Clinic, and only ids and hashes go on NEAR.",
  },
  {
    name: PEOPLE.arjun,
    place: ORG.hospital,
    line: "He opens the chart at St. Aster Hospital only after Maya approves.",
  },
  {
    name: PEOPLE.sofia,
    place: ORG.second,
    line: "She can read a second opinion at Northgate Heart Institute for a set number of days.",
  },
  {
    name: ORG.app,
    place: "Fictional fitness app",
    line: "It can receive a copy with identifiers removed, and that removal is best effort.",
  },
];

export type Badge = { text: string; tone: "" | "ok" | "bad" };

function liveShares(state: NavStory): number {
  let count = 0;
  if (state.consentStatus === "active" && !state.revoked.referral) count += 1;
  if (state.secondSent && !state.revoked.second) count += 1;
  if (state.deidSent && !state.revoked.deid) count += 1;
  return count;
}

export function navBadge(id: string, state: NavStory): Badge | null {
  if (id === "requests") {
    if (!state.referralSent) return { text: "-", tone: "" };
    if (state.revoked.referral) return { text: "Revoked", tone: "bad" };
    if (state.consentStatus === "active") return { text: "Approved", tone: "ok" };
    if (state.consentStatus === "declined") return { text: "Denied", tone: "bad" };
    return { text: "Pending", tone: "" };
  }
  if (id === "referral") return state.referralSent ? { text: "Sent", tone: "ok" } : { text: "-", tone: "" };
  if (id === "incoming") {
    if (!state.referralSent) return { text: "-", tone: "" };
    if (state.revoked.referral) return { text: "Revoked", tone: "bad" };
    if (state.hospitalOpened) return { text: "Open", tone: "ok" };
    if (state.consentStatus === "active") return { text: "Ready", tone: "" };
    return { text: "Waiting", tone: "" };
  }
  if (id === "second") {
    if (!state.secondSent && !state.revoked.second) return { text: "-", tone: "" };
    if (state.revoked.second) return { text: "Revoked", tone: "bad" };
    return { text: "Shared", tone: "ok" };
  }
  if (id === "apps") {
    if (!state.deidSent && !state.revoked.deid) return { text: "-", tone: "" };
    if (state.revoked.deid) return { text: "Revoked", tone: "bad" };
    return { text: "Copy", tone: "ok" };
  }
  if (id === "access") {
    const holders = liveShares(state);
    if (holders === 0) return { text: "-", tone: "" };
    const bad = state.revoked.referral || state.revoked.second || state.revoked.deid;
    return { text: holders === 1 ? "1 share" : `${holders} shares`, tone: bad ? "bad" : "" };
  }
  if (id === "activity" || id === "onchain" || id === "proof-log") {
    const happened = state.referralSent || state.secondSent || state.deidSent;
    return happened ? { text: "On NEAR", tone: "ok" } : { text: "-", tone: "" };
  }
  return null;
}

export type StoryNote = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tx: string | null;
};

export type NoteInput = NavStory & {
  referralTx?: string | null;
  consentTx?: string | null;
  hospitalOpenTx?: string | null;
  consultTx?: string | null;
  secondTx?: string | null;
  secondReplyTx?: string | null;
  deidTx?: string | null;
  revokeTx?: string | null;
};

function tx(value: string | null | undefined): string | null {
  if (!value || value.startsWith("stub-")) return null;
  return value;
}

export function storyNotes(state: NoteInput): StoryNote[] {
  const notes: StoryNote[] = [];
  if (state.referralSent) {
    notes.push({
      id: "requested",
      title: "New request",
      detail: "Riverbend Family Clinic asked Maya to share a referral.",
      href: "/patient",
      tx: tx(state.referralTx),
    });
  }
  if (state.consentStatus === "declined") {
    notes.push({
      id: "declined",
      title: "Request declined",
      detail: "Maya declined the referral. The share stays closed.",
      href: "/patient",
      tx: null,
    });
  }
  if (state.consentStatus === "active") {
    notes.push({
      id: "approved",
      title: "Share approved",
      detail: "Maya approved the hospital share.",
      href: "/patient/sharing",
      tx: tx(state.consentTx),
    });
  }
  if (state.consentStatus === "active" && !state.revoked.referral && state.expiryDays <= 7) {
    notes.push({
      id: "expiring",
      title: "Share expires soon",
      detail: "The hospital share is set to 7 days.",
      href: "/patient/sharing",
      tx: null,
    });
  }
  if (state.hospitalOpened) {
    notes.push({
      id: "opened",
      title: "Record opened",
      detail: "St. Aster Hospital opened the referral.",
      href: "/hospital",
      tx: tx(state.hospitalOpenTx),
    });
  }
  if (state.consultSent) {
    notes.push({
      id: "reply",
      title: "Reply received",
      detail: "St. Aster Hospital sent a note back to Maya.",
      href: "/hospital",
      tx: tx(state.consultTx),
    });
  }
  if (state.secondSent) {
    notes.push({
      id: "second",
      title: "Second opinion sent",
      detail: "Dr. Reyes has a time-limited copy.",
      href: "/reyes",
      tx: tx(state.secondTx),
    });
  }
  if (state.secondOpened) {
    notes.push({
      id: "second-open",
      title: "Second opinion opened",
      detail: "Dr. Reyes opened the copy.",
      href: "/reyes",
      tx: null,
    });
  }
  if (state.secondReplySent) {
    notes.push({
      id: "second-reply",
      title: "Reply from Dr. Reyes",
      detail: "The reply comes back to Maya only.",
      href: "/reyes",
      tx: tx(state.secondReplyTx),
    });
  }
  if (state.deidSent) {
    notes.push({
      id: "deid",
      title: "App copy sent",
      detail: "PulseFit received a de-identified copy. That removal is best effort.",
      href: "/pulsefit",
      tx: tx(state.deidTx),
    });
  }
  if (state.deidOpened) {
    notes.push({
      id: "deid-open",
      title: "App opened the copy",
      detail: "PulseFit opened the stripped copy.",
      href: "/pulsefit",
      tx: null,
    });
  }
  if (state.revoked.referral) {
    notes.push({
      id: "revoke-referral",
      title: "Revoke confirmed",
      detail: "St. Aster Hospital cannot open the share again here. A copy already saved is not erased.",
      href: "/patient/sharing",
      tx: tx(state.revokeTx),
    });
  }
  if (state.revoked.second) {
    notes.push({
      id: "revoke-second",
      title: "Second opinion revoked",
      detail: "Dr. Reyes cannot open that share again here.",
      href: "/patient/sharing",
      tx: tx(state.revokeTx),
    });
  }
  if (state.revoked.deid) {
    notes.push({
      id: "revoke-deid",
      title: "App copy revoked",
      detail: "PulseFit cannot fetch the copy again here.",
      href: "/pulsefit",
      tx: tx(state.revokeTx),
    });
  }
  return notes;
}

export function unreadCount(notes: readonly StoryNote[], seen: readonly string[]): number {
  const have = new Set(seen);
  return notes.filter((note) => !have.has(note.id)).length;
}

export function contractExplorerHref(contractId: string): string {
  return `https://testnet.nearblocks.io/address/${encodeURIComponent(contractId)}`;
}

export function txExplorerHref(txHash: string): string {
  return `https://testnet.nearblocks.io/txns/${encodeURIComponent(txHash)}`;
}

export type Count = { label: string; value: number };

export type DashNext = { nextLabel: string; nextHref: string; counts: Count[] };

function activeShares(state: NavStory): number {
  let count = 0;
  if (state.consentStatus === "active" && !state.revoked.referral) count += 1;
  if (state.secondSent && !state.revoked.second) count += 1;
  if (state.deidSent && !state.revoked.deid) count += 1;
  return count;
}

export function patientDash(state: NavStory, accountReady: boolean): DashNext {
  const pending = state.referralSent && state.consentStatus === "pending" && !state.revoked.referral ? 1 : 0;
  const next = !accountReady
    ? { nextLabel: "Set up your test account.", nextHref: "/patient" }
    : !state.referralSent
      ? { nextLabel: "Wait for Riverbend Family Clinic to send the referral.", nextHref: "/clinic" }
      : pending
        ? { nextLabel: "Review the request and approve or decline.", nextHref: "/patient" }
        : state.consentStatus === "declined"
          ? { nextLabel: "The request was declined. Reset the story to try the approve path.", nextHref: "/patient" }
          : { nextLabel: "See who can still open your records.", nextHref: "/patient/sharing" };
  return {
    ...next,
    counts: [
      { label: "Requests", value: pending },
      { label: "Active shares", value: activeShares(state) },
      { label: "Opens", value: state.openCount + Number(state.secondOpened) + Number(state.deidOpened) },
    ],
  };
}

export function clinicDash(state: NavStory): DashNext {
  const next = !state.referralSent
    ? { nextLabel: "Send the referral.", nextHref: "/clinic" }
    : state.revoked.referral
      ? { nextLabel: "This share was revoked.", nextHref: "/clinic#sent" }
      : { nextLabel: "See where the referral stands.", nextHref: "/clinic#sent" };
  return {
    ...next,
    counts: [
      { label: "Sent", value: Number(state.referralSent) },
      { label: "Approved", value: state.consentStatus === "active" ? 1 : 0 },
      { label: "Opened", value: Number(state.hospitalOpened) },
    ],
  };
}

export function hospitalDash(state: NavStory): DashNext {
  const waiting = state.referralSent && !state.hospitalOpened && state.consentStatus !== "active" && !state.revoked.referral ? 1 : 0;
  const ready = state.consentStatus === "active" && !state.hospitalOpened && !state.revoked.referral ? 1 : 0;
  const next = !state.referralSent
    ? { nextLabel: "Waiting for Riverbend Family Clinic to send the next step.", nextHref: "/hospital" }
    : state.revoked.referral
      ? { nextLabel: "The next open is refused.", nextHref: "/hospital" }
      : state.consentStatus !== "active"
        ? { nextLabel: "Waiting for Maya to approve.", nextHref: "/hospital" }
        : !state.hospitalOpened
          ? { nextLabel: "Open the chart.", nextHref: "/hospital" }
          : !state.consultSent
            ? { nextLabel: "Send the consult note.", nextHref: "/hospital#reply" }
            : { nextLabel: "Review the open.", nextHref: "/hospital" };
  return {
    ...next,
    counts: [
      { label: "Waiting", value: waiting },
      { label: "Ready", value: ready },
      { label: "Opens", value: state.hospitalOpened ? state.openCount : 0 },
    ],
  };
}

export function adminDash(state: NavStory): DashNext {
  const revokes = Number(state.revoked.referral) + Number(state.revoked.second) + Number(state.revoked.deid);
  const refused = state.blockedAttempt && state.revoked.referral ? 1 : 0;
  return {
    nextLabel: "Review who can still open records.",
    nextHref: "/audit",
    counts: [
      { label: "Active shares", value: activeShares(state) },
      { label: "Opens", value: state.openCount },
      { label: "Revokes", value: revokes },
      { label: "Refused opens", value: refused },
    ],
  };
}

export function referralStand(state: NavStory): "Not sent" | "Pending" | "Approved" | "Opened" | "Revoked" | "Declined" {
  if (!state.referralSent) return "Not sent";
  if (state.revoked.referral) return "Revoked";
  if (state.consentStatus === "declined") return "Declined";
  if (state.hospitalOpened) return "Opened";
  if (state.consentStatus === "active") return "Approved";
  return "Pending";
}
