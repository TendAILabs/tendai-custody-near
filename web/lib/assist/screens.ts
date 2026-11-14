import type { AssistRole } from "./types.ts";

export type ScreenNote = {
  route: string;
  role: AssistRole;
  title: string;
  does: string;
  buttons: string;
  nextHref: string;
  nextLabel: string;
};

export const SCREENS: ScreenNote[] = [
  {
    route: "/docs",
    role: "visitor",
    title: "Docs",
    does: "The docs page explains the testnet contract, the guided demo, and what is fictional. Designed around HIPAA principles. Fictional data only.",
    buttons: "Use the contents list. Judges can start with the guided demo.",
    nextHref: "/home?guide=1",
    nextLabel: "Guided demo",
  },
  {
    route: "/",
    role: "visitor",
    title: "Home",
    does: "The home screen introduces the demo. The story, the clinic, and every chart are fictional.",
    buttons: "Guided demo opens a step-by-step path. Help and Support are in the footer.",
    nextHref: "/help",
    nextLabel: "Help",
  },
  {
    route: "/landing",
    role: "visitor",
    title: "Landing",
    does: "The landing page explains patient-approved record transfers on NEAR testnet with fictional example data.",
    buttons: "Use the page links to open the app or the guided demo.",
    nextHref: "/help",
    nextLabel: "Help",
  },
  {
    route: "/help",
    role: "visitor",
    title: "Help",
    does: "Short answers cover who can see the chart, what revoke does and cannot do, what is stored on NEAR, the sealed AI, de-identification, testnet, and fictional data.",
    buttons: "Each question on the left opens its answer.",
    nextHref: "/support",
    nextLabel: "Support",
  },
  {
    route: "/support",
    role: "visitor",
    title: "Support",
    does: "This page shows whether NEAR and the sealed summary are reachable. Signed support notes from Help are saved. Each saved note is kept for 30 days after its last update.",
    buttons: "Read the status here. Send a note from Help.",
    nextHref: "/help",
    nextLabel: "Help",
  },
  {
    route: "/privacy",
    role: "visitor",
    title: "Privacy",
    does: "Plain language: fictional data only, hashes on NEAR, sealed summaries, best-effort de-identification, and the revoke limit.",
    buttons: "Back to Support.",
    nextHref: "/help",
    nextLabel: "Help",
  },
  {
    route: "/terms",
    role: "visitor",
    title: "Terms",
    does: "This is a hackathon demo on NEAR testnet. It is not a live clinic system and not a medical device. The chart and the sealed summary are examples, not medical advice.",
    buttons: "Back to Support.",
    nextHref: "/help",
    nextLabel: "Help",
  },
  {
    route: "/home",
    role: "visitor",
    title: "Where each desk lives",
    does: "Role tiles for the demo desks. This is still the fictional testnet story.",
    buttons: "Open a desk.",
    nextHref: "/clinic",
    nextLabel: "Riverbend Family Clinic",
  },
  {
    route: "/demo",
    role: "visitor",
    title: "Guided demo",
    does: "A split view of the story through the clinic, the patient, and the hospital. The data is fictional.",
    buttons: "Follow the stepper.",
    nextHref: "/clinic",
    nextLabel: "Riverbend Family Clinic",
  },
  {
    route: "/clinic",
    role: "clinic",
    title: "Riverbend Family Clinic",
    does: "The clinic prepares a referral. The chart is encrypted on this device. NEAR stores hashes, not the chart text.",
    buttons: "Section tags choose what to include. Send referral writes the referral. A staff key cannot consent for the patient.",
    nextHref: "/patient",
    nextLabel: "Patient requests",
  },
  {
    route: "/patient",
    role: "patient",
    title: "Patient requests",
    does: "The patient sees the referral, chooses sections and how long the share lasts, and reads the sealed summary before approving.",
    buttons: "Check with secure AI runs the sealed summary. Approve and share stays off unless the signature is provider_tee. Deny declines. Revoke stops a later open.",
    nextHref: "/verification",
    nextLabel: "Verification",
  },
  {
    route: "/patient/consent",
    role: "patient",
    title: "Consent",
    does: "The same request, with the sealed summary and the provider_tee mark. Approve stays off unless that mark is present.",
    buttons: "Check with secure AI, Approve and share, and Deny.",
    nextHref: "/verification",
    nextLabel: "Verification",
  },
  {
    route: "/patient/records",
    role: "patient",
    title: "Records",
    does: "Records on this device and a path toward a second opinion. The chart text stays off NEAR.",
    buttons: "Open a record from the list.",
    nextHref: "/patient",
    nextLabel: "Requests",
  },
  {
    route: "/patient/records/[id]",
    role: "patient",
    title: "Record detail",
    does: "One record on this device. The chain stores ids and hashes for this record, not the chart text.",
    buttons: "Back to the records list.",
    nextHref: "/patient/records",
    nextLabel: "Records",
  },
  {
    route: "/patient/deid",
    role: "patient",
    title: "De-identified copy",
    does: "A before and after scrub, then a sealed leak scan. De-identification is best effort, with a preview. It may miss something.",
    buttons: "Run leak scan. Send to PulseFit stays off until the scan is clean.",
    nextHref: "/pulsefit",
    nextLabel: "PulseFit",
  },
  {
    route: "/patient/sharing",
    role: "patient",
    title: "Access",
    does: "Who holds a share. Revoke stops that holder from opening the chart again. Revoke cannot erase a copy already downloaded.",
    buttons: "Revoke on a holder.",
    nextHref: "/patient/timeline",
    nextLabel: "Custody log",
  },
  {
    route: "/patient/timeline",
    role: "patient",
    title: "Custody log",
    does: "The same on-chain events in plain words. NEAR stores ids, hashes, and timestamps, not the chart.",
    buttons: "Open an event to read it.",
    nextHref: "/onchain",
    nextLabel: "Proof on NEAR",
  },
  {
    route: "/patient/history",
    role: "patient",
    title: "History",
    does: "Another view of the custody events. The chain still holds ids, hashes, and timestamps only.",
    buttons: "Read an event.",
    nextHref: "/patient/timeline",
    nextLabel: "Custody log",
  },
  {
    route: "/hospital",
    role: "hospital",
    title: "St. Aster Hospital",
    does: "The hospital opens an approved share with a ticket. The open is logged on NEAR. A revoked share is refused.",
    buttons: "Request open. Send consult note after the chart is open.",
    nextHref: "/patient/timeline",
    nextLabel: "Custody log",
  },
  {
    route: "/hospital/blocked",
    role: "hospital",
    title: "Blocked open",
    does: "The next open after revoke is refused. A refused open does not necessarily create a custody event. Revoke still cannot erase a copy that was already saved.",
    buttons: "Read the refusal.",
    nextHref: "/hospital",
    nextLabel: "St. Aster Hospital",
  },
  {
    route: "/reyes",
    role: "second",
    title: "Dr. Reyes",
    does: "A read-only second opinion. The doctor can open only if the patient sent a share, and the reply goes back to the patient.",
    buttons: "Request open. Send a reply.",
    nextHref: "/patient",
    nextLabel: "Patient requests",
  },
  {
    route: "/pulsefit",
    role: "app",
    title: "PulseFit",
    does: "The app receives only the de-identified copy. That copy is best effort. It is not a promise against re-identification.",
    buttons: "Open the copy, or return to the de-identification screen to send it again.",
    nextHref: "/patient/deid",
    nextLabel: "De-identified copy",
  },
  {
    route: "/verification",
    role: "proof",
    title: "Verification",
    does: "The panel is green only when the signature kind is provider_tee. It shows the model, the signer, and the request and response hashes.",
    buttons: "Inspect attestation. Tamper flips one envelope byte and the check turns red.",
    nextHref: "/verification/tamper",
    nextLabel: "Tamper check",
  },
  {
    route: "/verification/tamper",
    role: "proof",
    title: "Tamper check",
    does: "One ciphertext byte was flipped. The server refuses it. Approve stays off.",
    buttons: "Read the refusal.",
    nextHref: "/verification",
    nextLabel: "Verification",
  },
  {
    route: "/onchain",
    role: "proof",
    title: "Proof on NEAR",
    does: "A direct look at the contract record: ids and hashes. The contract in this demo is on NEAR testnet.",
    buttons: "Read the events. Open the custody log for the same facts in plain words.",
    nextHref: "/patient/timeline",
    nextLabel: "Custody log",
  },
];

const ROUTE_OK = /^\/[a-z0-9/_-]*$/;

export function normalizeRoute(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const path = raw.split("?")[0]?.split("#")[0] ?? "/";
  if (!path.startsWith("/") || path.length > 80 || !ROUTE_OK.test(path)) return "/";
  return path.replace(/\/records\/[^/]+$/, "/records/[id]");
}

export function roleForRoute(route: string): AssistRole {
  if (route.startsWith("/clinic")) return "clinic";
  if (route.startsWith("/hospital")) return "hospital";
  if (route.startsWith("/reyes")) return "second";
  if (route.startsWith("/pulsefit")) return "app";
  if (route.startsWith("/verification") || route.startsWith("/onchain")) return "proof";
  if (route.startsWith("/patient")) return "patient";
  return "visitor";
}

export function screenFor(route: string): ScreenNote {
  const exact = SCREENS.find((item) => item.route === route);
  if (exact) return exact;
  const prefix = SCREENS.filter((item) => item.route !== "/" && (route === item.route || route.startsWith(`${item.route}/`))).sort(
    (left, right) => right.route.length - left.route.length,
  )[0];
  if (prefix) return { ...prefix, route };
  return {
    route,
    role: roleForRoute(route),
    title: "This screen",
    does: "Ask TendAI can explain how the demo works. It does not read the chart.",
    buttons: "Use Help for the short answers.",
    nextHref: "/help",
    nextLabel: "Help",
  };
}
