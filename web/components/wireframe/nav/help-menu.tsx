"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

const LINKS = [
  { href: "/docs", label: "Docs", note: "How the demo works, for a judge or a clinician." },
  { href: "/help", label: "FAQ", note: "Questions, grouped by role." },
  { href: "/glossary", label: "Glossary", note: "Plain words for the proof." },
  { href: "/support", label: "Support", note: "Report a problem. Nothing is emailed." },
];

export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="c2-pop-wrap c2-help" ref={wrap}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} data-testid="help-menu" onClick={() => setOpen((value) => !value)}>
        Help
      </button>
      {open ? (
        <ul className="c2-pop" id={menuId} role="menu" aria-label="Help">
          {LINKS.map((item) => (
            <li key={item.href} role="none">
              <Link href={item.href} role="menuitem" onClick={() => setOpen(false)}>
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
