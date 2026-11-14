"use client";

import { useEffect, useRef } from "react";
import { useAsk } from "./ask-context";
import "./ask.css";

export function AskLaunch() {
  const { open, setOpen } = useAsk();
  const ref = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open) ref.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <button
      ref={ref}
      type="button"
      className="ask-launch"
      data-testid="ask-tendai-button"
      aria-label="Ask TendAI"
      aria-expanded={open}
      aria-controls={open ? "ask-tendai-panel" : undefined}
      hidden={open}
      onClick={() => setOpen(true)}
    >
      <span aria-hidden="true">?</span>
    </button>
  );
}
