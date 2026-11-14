"use client";

import { useState, type ReactNode } from "react";
import { glossaryEntry, isGlossaryId, type GlossaryId } from "@/lib/copy/glossary";

export function Tip({ children, label, body, up = false }: { children: ReactNode; label: string; body: string; up?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className={open ? "c2-tip open" : "c2-tip"}
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <span className={up ? "c2-tip-box up" : "c2-tip-box"} style={{ maxWidth: "min(280px, calc(100vw - 48px))" }}>
        <span className="lab">{label}</span>
        {body}
      </span>
    </button>
  );
}

export function GlossaryTip({ id, children, up = false }: { id: GlossaryId; children?: ReactNode; up?: boolean }) {
  const entry = glossaryEntry(id);
  return (
    <Tip label={entry.term} body={entry.tip} up={up}>
      {children ?? entry.term}
    </Tip>
  );
}

export function CopyWithTips({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern = /\{([a-z0-9_]+)\}/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const id = match[1] ?? "";
    if (isGlossaryId(id)) parts.push(<GlossaryTip key={`${id}-${start}`} id={id} />);
    else parts.push(match[0]);
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
