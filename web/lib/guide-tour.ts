import { GUIDE_STEPS, type GuideStep } from "./guide.ts";

export const TOUR_STEP_KEY = "rr-tour-step";

export type TourTarget = GuideStep["target"] | "approve" | "sign";

/** Which control the callout should sit beside for this step. */
export function tourTarget(index: number, ctx: { teeGreen: boolean; signVisible: boolean }): TourTarget {
  const step = GUIDE_STEPS[index];
  if (!step) return "setup";
  if (step.n === 3) {
    if (ctx.signVisible) return "sign";
    if (ctx.teeGreen) return "approve";
    return "summary";
  }
  if (step.n === 5 && ctx.signVisible) return "sign";
  return step.target;
}

/** One or two sentences for the callout, aimed at the control it is pointing at. */
export function tourWhy(index: number, target: TourTarget): string {
  const step = GUIDE_STEPS[index];
  if (!step) return "";
  if (target === "approve") {
    return "Approve and share records Maya's yes on NEAR, and the hospital cannot open the chart until that signature is in.";
  }
  if (target === "sign" && step.n === 3) {
    return "Sign sends Maya's approval to NEAR testnet, and in this hosted demo the server holds her key and signs for her.";
  }
  if (target === "sign" && step.n === 5) {
    return "Sign records the revoke on NEAR, which stops later opens and cannot erase a copy someone already downloaded.";
  }
  return step.why;
}

export function readTourStep(): number {
  if (typeof window === "undefined") return 0;
  const raw = Number(localStorage.getItem(TOUR_STEP_KEY));
  if (!Number.isInteger(raw) || raw < 0 || raw >= GUIDE_STEPS.length) return 0;
  return raw;
}

export function writeTourStep(index: number): void {
  localStorage.setItem(TOUR_STEP_KEY, String(index));
}
