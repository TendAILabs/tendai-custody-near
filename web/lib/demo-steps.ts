import type { Story } from "./story";

export const DEMO_STEPS: { label: string; hint: string }[] = [
  {
    label: "Clinic refers",
    hint: "Dr. Lena Park at Riverbend Family Clinic refers Maya to St. Aster Hospital. Tick the sections, then send.",
  },
  {
    label: "Patient approves",
    hint: "On Maya's phone, untick the 2021 counseling note, keep 30 days, read the summary, open Verified, then Approve.",
  },
  {
    label: "Hospital opens",
    hint: "Dr. Arjun Mehta opens the share. The open is logged before the chart is shown. Then send the consult note.",
  },
  {
    label: "Second opinion",
    hint: "Maya sends a read-only second opinion to Dr. Sofia Reyes for 7 days. Open it and reply to Maya.",
  },
  {
    label: "De-id app copy",
    hint: "Preview the stripped copy, run the leak scan, send it to PulseFit, then open it on the app screen.",
  },
  {
    label: "Revoke",
    hint: "The timeline lists every copy. Revoke St. Aster.",
  },
  {
    label: "Hospital blocked",
    hint: "Dr. Mehta taps Open again. The live contract refuses request_open with ERR_REVOKED.",
  },
];

export function isDemoStepDone(step: number, state: Story): boolean {
  switch (step) {
    case 0:
      return state.referralSent;
    case 1:
      return state.consentStatus === "active";
    case 2:
      return state.hospitalOpened && state.consultSent;
    case 3:
      return state.secondSent && state.secondReplySent;
    case 4:
      return state.deidSent && state.deidOpened;
    case 5:
      return state.revoked.referral;
    case 6:
      return state.blockedAttempt;
    default:
      return false;
  }
}
