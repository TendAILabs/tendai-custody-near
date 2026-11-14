"use client";

import Link from "next/link";
import { GUIDE_STEPS, guideComplete, guideCurrent, guideDeclined, guideDone, onGuidePage } from "@/lib/guide";
import type { Story } from "@/lib/story";
import { useStory } from "@/lib/story-context";
import { clearSetup, useAccountReady } from "@/lib/visitor/use-account";
import { Arrow } from "./c2";

export function Stepper({ state, pathname }: { state: Story; pathname: string }) {
  const { reset } = useStory();
  const account = useAccountReady();
  const ready = account.setupDone;
  const current = guideCurrent(state, ready);
  const done = guideDone(state, ready);
  const step = GUIDE_STEPS[current];
  const previous = current > 0 ? GUIDE_STEPS[current - 1] : null;
  const here = onGuidePage(pathname, step.href);
  const onPrevious = Boolean(previous && done[current - 1] && onGuidePage(pathname, previous.href) && !here);
  const stepDone = done[current];
  const finished = guideComplete(state, ready);
  const declined = guideDeclined(state, ready);
  const failed = Boolean(state.chainError) && here && !stepDone && !declined;

  let detail = step.doThis;
  let tone = "";
  if (finished) {
    detail = "Demo complete. Reset the story if you want to play it again.";
  } else if (onPrevious) {
    detail = `Next: ${step.label}.`;
  } else if (!here) {
    detail = `You left the guide. Back to step ${step.n}.`;
  } else if (declined) {
    detail = "Maya said no. The hospital is blocked. Reset the story to try the approve path.";
    tone = "bad";
  } else if (failed) {
    detail = "That step did not go through. Read the message below, and then try again.";
    tone = "bad";
  }

  const following = GUIDE_STEPS[current + 1];
  const nextStep = onPrevious ? step : here && stepDone ? following : undefined;
  const back = !finished && !here && !onPrevious;
  const href = nextStep ? nextStep.href : step.href;
  const button = finished ? "Reset story" : nextStep ? "Next" : back ? `Back to step ${step.n}` : step.waiting;

  return (
    <div className="c2-stepper" role="navigation" aria-label="Guided demo progress">
      <div className="sl">
        <span className="sn">
          <span className="sn-long">{finished ? "Demo complete" : `Step ${step.n} of ${GUIDE_STEPS.length}`}</span>
          <span className="sn-short">{finished ? "Done" : `${step.n}/${GUIDE_STEPS.length}`}</span>
        </span>
        <span className="stxt">{finished ? "You finished the story" : step.label}</span>
      </div>
      <p className={tone === "bad" ? "sdo bad" : "sdo"}>{detail}</p>
      <div className="srgt">
        <div className="dots" aria-hidden="true">
          {GUIDE_STEPS.map((item, index) => (
            <span key={item.n} className={done[index] ? "done" : index === current ? "now" : ""}>
              {String(item.n).padStart(2, "0")}
            </span>
          ))}
        </div>
        {finished ? (
          <button type="button" className="nxt" onClick={() => { clearSetup(); reset(); }}>
            <i />
            {button}
          </button>
        ) : nextStep || back ? (
          <Link className="nxt" href={href} style={{ ["--nc" as string]: (nextStep ?? step).color }}>
            <i />
            {button} <Arrow />
          </Link>
        ) : (
          <span className="nxt is-wait" aria-disabled="true">
            <i />
            {button}
          </span>
        )}
      </div>
    </div>
  );
}
