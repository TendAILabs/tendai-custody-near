"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GUIDE_STEPS, guideDone, onGuidePage } from "@/lib/guide";
import { readTourStep, tourTarget, tourWhy, writeTourStep, type TourTarget } from "@/lib/guide-tour";
import { useStory } from "@/lib/story-context";
import { useAccountReady } from "@/lib/visitor/use-account";
import { setGuided } from "./intro-modal";

type Box = { top: number; left: number; width: number; height: number };

function place(target: Box, width: number, height: number): { top: number; left: number } {
  const margin = 12;
  const gap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const narrow = vw < 720;
  const spaceRight = vw - (target.left + target.width) - gap - margin;
  const spaceBelow = vh - (target.top + target.height) - gap - margin;
  const spaceAbove = target.top - gap - margin;
  let top = margin;
  let left = margin;
  if (!narrow && spaceRight >= width) {
    left = target.left + target.width + gap;
    top = Math.min(Math.max(margin, target.top), vh - height - margin);
  } else if (spaceBelow >= height) {
    top = target.top + target.height + gap;
    left = Math.min(Math.max(margin, target.left), vw - width - margin);
  } else if (spaceAbove >= height) {
    top = target.top - gap - height;
    left = Math.min(Math.max(margin, target.left), vw - width - margin);
  } else {
    top = Math.max(margin, vh - height - margin);
    left = margin;
  }
  return {
    top: Math.min(Math.max(margin, top), Math.max(margin, vh - height - margin)),
    left: Math.min(Math.max(margin, left), Math.max(margin, vw - width - margin)),
  };
}

export function GuideTour() {
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useStory();
  const account = useAccountReady();
  const done = guideDone(state, account.setupDone);
  const doneKey = done.map((item) => (item ? "1" : "0")).join("");
  const [index, setIndex] = useState(readTourStep);
  const [targetKey, setTargetKey] = useState<TourTarget>("setup");
  const [found, setFound] = useState(false);
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const missSince = useRef<number | null>(null);
  const targetRef = useRef<TourTarget>("setup");
  const foundRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const marked = useRef<HTMLElement | null>(null);
  const anchored = useRef<HTMLElement | null>(null);
  const seenDone = useRef<boolean[] | null>(null);
  const focusKey = useRef("");

  const step = GUIDE_STEPS[index] ?? GUIDE_STEPS[0];
  const why = tourWhy(index, targetKey);
  const last = index >= GUIDE_STEPS.length - 1;
  const canNext = done[index] || last;

  function go(next: number) {
    const clamped = Math.max(0, Math.min(GUIDE_STEPS.length - 1, next));
    writeTourStep(clamped);
    setIndex(clamped);
    const href = GUIDE_STEPS[clamped]?.href;
    if (href && !onGuidePage(pathname, href)) router.push(href);
  }

  function exit() {
    setGuided(false);
  }

  useEffect(() => {
    const flags = doneKey.split("").map((item) => item === "1");
    const was = seenDone.current;
    seenDone.current = flags;
    const jump = (next: number) => {
      writeTourStep(next);
      setIndex(next);
    };
    if (!was) {
      if (flags[index] && index < GUIDE_STEPS.length - 1) {
        const next = flags.findIndex((item) => !item);
        if (next > index) jump(next);
      }
      return;
    }
    if (!was[index] && flags[index] && index < GUIDE_STEPS.length - 1) jump(index + 1);
  }, [doneKey, index]);

  useEffect(() => {
    if (!onGuidePage(pathname, step.href)) router.push(step.href);
  }, [pathname, router, step.href]);

  useEffect(() => {
    let frame = 0;

    const clearMark = () => {
      const node = marked.current;
      if (!node) return;
      node.classList.remove("is-guide-target");
      node.style.removeProperty("--guide-c");
      if (node.getAttribute("aria-describedby") === "guide-callout") node.removeAttribute("aria-describedby");
      marked.current = null;
    };

    const measure = () => {
      const signVisible = Boolean(document.querySelector('[data-guide="sign"]'));
      const key = tourTarget(index, { teeGreen: state.teeStatus === "green", signVisible });
      const el = document.querySelector<HTMLElement>(`[data-guide="${key}"]`);
      if (targetRef.current !== key) {
        targetRef.current = key;
        setTargetKey(key);
      }
      const has = Boolean(el);
      if (foundRef.current !== has) {
        foundRef.current = has;
        setFound(has);
      }
      if (marked.current && marked.current !== el) clearMark();
      const card = cardRef.current;
      if (!el) {
        anchored.current = null;
        if (missSince.current === null) missSince.current = Date.now();
        if (Date.now() - missSince.current > 6000) setStale(true);
        if (card) {
          const box = card.getBoundingClientRect();
          const w = box.width || Math.min(340, window.innerWidth - 24);
          const h = box.height || 220;
          card.style.top = `${Math.round(Math.max(12, (window.innerHeight - h) / 2))}px`;
          card.style.left = `${Math.round(Math.max(12, (window.innerWidth - w) / 2))}px`;
        }
        return;
      }
      missSince.current = null;
      setStale(false);
      if (anchored.current !== el) {
        anchored.current = el;
        const narrow = window.innerWidth < 720;
        el.style.scrollMarginTop = narrow ? "16px" : "88px";
        el.style.scrollMarginBottom = narrow ? "240px" : "96px";
        el.scrollIntoView({ block: narrow ? "start" : "center", inline: "nearest", behavior: "auto" });
      }
      el.classList.add("is-guide-target");
      el.style.setProperty("--guide-c", step.color);
      el.setAttribute("aria-describedby", "guide-callout");
      marked.current = el;
      if (!card) return;
      const rect = el.getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      const next = place({ top: rect.top, left: rect.left, width: rect.width, height: rect.height }, cardBox.width || Math.min(340, window.innerWidth - 24), cardBox.height || 220);
      card.style.top = `${Math.round(next.top)}px`;
      card.style.left = `${Math.round(next.left)}px`;
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();
    const timer = window.setInterval(schedule, 400);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      clearMark();
    };
  }, [index, pathname, state.teeStatus, step.color, attempt]);

  useEffect(() => {
    const key = `${index}:${targetKey}`;
    if (focusKey.current === key) return;
    focusKey.current = key;
    cardRef.current?.focus();
  }, [index, targetKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        exit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={cardRef}
      id="guide-callout"
      className="guide-callout"
      role="dialog"
      aria-modal="false"
      aria-labelledby="guide-callout-title"
      tabIndex={-1}
      style={{ top: 12, left: 12 }}
    >
      <div className="guide-callout-num" style={{ ["--c" as string]: step.color }}>
        <b>{String(step.n).padStart(2, "0")}</b>
        <span>{step.actor}</span>
      </div>
      <h2 id="guide-callout-title">{step.label}</h2>
      <p>{why}</p>
      {found ? null : (
        <p className="guide-callout-miss" role="status">
          {stale
            ? "Still waiting for NEAR testnet or for this page. You can retry, skip to the next step, or exit."
            : "Waiting for NEAR testnet and this page. The control shows up here once it is ready."}
        </p>
      )}
      <div className="guide-callout-actions">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0}>
          Back
        </button>
        {!found && stale ? (
          <button
            type="button"
            onClick={() => {
              missSince.current = null;
              anchored.current = null;
              setStale(false);
              setAttempt((value) => value + 1);
              router.push(step.href);
              router.refresh();
            }}
          >
            Retry
          </button>
        ) : null}
        {!found && stale && !last ? (
          <button type="button" onClick={() => go(index + 1)}>
            Skip
          </button>
        ) : null}
        {canNext ? (
          <button type="button" className="guide-next" onClick={() => (last ? exit() : go(index + 1))}>
            {last ? "Done" : "Next"}
          </button>
        ) : null}
        <button type="button" onClick={exit}>
          Exit
        </button>
      </div>
    </div>
  );
}
