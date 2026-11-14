"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GUIDE_STEPS } from "@/lib/guide";
import { writeTourStep } from "@/lib/guide-tour";
import { Arrow, Btn } from "./c2";

const SEEN = "rr-intro-seen";
const GUIDED = "rr-guided";

export function markIntroSeen(): void {
  localStorage.setItem(SEEN, "1");
  window.dispatchEvent(new Event("rr-local"));
}

export function introSeen(): boolean {
  return localStorage.getItem(SEEN) === "1";
}

export function guidedOn(): boolean {
  return localStorage.getItem(GUIDED) === "1";
}

export function setGuided(on: boolean): void {
  localStorage.setItem(GUIDED, on ? "1" : "0");
  markIntroSeen();
}

export function IntroModal({
  onClose,
  startHref,
  startIndex,
  resume = false,
}: {
  onClose: (mode: "guide" | "explore" | "resume") => void;
  startHref: string;
  startIndex: number;
  resume?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setGuided(false);
      onClose("explore");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="c2-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-title"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        setGuided(false);
        onClose("explore");
      }}
    >
      <div className="c2-intro">
        <div className="c2-eye">How this works</div>
        <h1 id="intro-title">
          You&apos;ll play each person in the story while Maya stays in <mark className="c2-mark">control</mark> of her record.
        </h1>
        <p className="c2-lede">It takes about 3 minutes, and every name and record in the story is fictional.</p>
        <div className="c2-intro-steps">
          {GUIDE_STEPS.map((step) => (
            <div key={step.n} className="c2-intro-step" style={{ ["--c" as string]: step.color }}>
              <div className="num">
                <b>{String(step.n).padStart(2, "0")}</b>
                <span>{step.actor}</span>
              </div>
              <h2>{step.label}</h2>
              <p>{step.doThis}</p>
            </div>
          ))}
        </div>
        <div className="c2-intro-actions">
          <Btn
            testId="start-guided-demo"
            onClick={() => {
              writeTourStep(startIndex);
              setGuided(true);
              onClose("guide");
              router.push(startHref);
            }}
          >
            {resume ? "Resume" : "Start"} <Arrow />
          </Btn>
          <Btn
            tone="ghost"
            onClick={() => {
              setGuided(false);
              onClose("explore");
            }}
          >
            Explore on my own
          </Btn>
          {resume ? (
            <button type="button" className="c2-btn ghost" onClick={() => onClose("resume")}>
              Back to this step
            </button>
          ) : null}
          <p className="note">
            The records here are fictional and the product is designed around HIPAA principles, and{" "}
            <Link href="/start">How we prove it</Link> explains what is real and what is only this demo.
          </p>
        </div>
      </div>
    </div>
  );
}
