import { GUIDE_STEPS } from "../guide.ts";

const BODIES = [
  "Press the Use the demo server account button on Maya's page to continue.",
  "Send the fictional referral from Riverbend Family Clinic. The contract stores ids and hashes, and the chart text stays off NEAR.",
  "Tap Check with secure AI, and then tap Approve and share. Your signature is what lets the hospital open the share.",
  "Open the chart at St. Aster Hospital. The open is written to NEAR before the chart appears.",
  "Revoke St. Aster Hospital on the access page. Revoke stops future opens, and it cannot erase a copy someone already downloaded.",
  "Open the chart again at St. Aster Hospital. The contract check refuses the open, and nothing new is written or shared.",
  "Read the activity log, the access review, and the AI receipt. A second opinion and a PulseFit copy are optional extras.",
];

export type WalkStep = {
  at: string;
  title: string;
  href: string;
  link: string;
  body: string;
  also?: { href: string; link: string };
};

export const WALKTHROUGH: readonly WalkStep[] = GUIDE_STEPS.map((step, index) => ({
  at: `Step ${step.n}`,
  title: step.label,
  href: step.href.split("?")[0].split("#")[0],
  link: `Open step ${step.n}`,
  body: BODIES[index] ?? step.doThis,
}));
