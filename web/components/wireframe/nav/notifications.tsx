"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { storyNotes, txExplorerHref, unreadCount, type NoteInput } from "@/lib/nav/model";
import { ping, subscribe } from "./bus";

const SEEN = "rr-notes-seen";
const EMPTY: string[] = [];
let seenRaw = "";
let seenCache: string[] = EMPTY;

function readSeen(): string[] {
  const raw = localStorage.getItem(SEEN) ?? "[]";
  if (raw === seenRaw) return seenCache;
  seenRaw = raw;
  try {
    const parsed = JSON.parse(raw) as unknown;
    seenCache = Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : EMPTY;
  } catch {
    seenCache = EMPTY;
  }
  return seenCache;
}

export function NotificationsBell({ state }: { state: NoteInput }) {
  const notes = storyNotes(state);
  const [open, setOpen] = useState(false);
  const seen = useSyncExternalStore((onStore) => subscribe("rr-notes", onStore), readSeen, () => EMPTY);
  const wrap = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const unread = unreadCount(notes, seen);

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
    <div className="c2-pop-wrap" ref={wrap}>
      <button
        type="button"
        className="c2-bell"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="notifications-bell"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications, none unread"}
        onClick={() => {
          if (!open) {
            localStorage.setItem(SEEN, JSON.stringify(notes.map((note) => note.id)));
            seenRaw = "";
            ping("rr-notes");
          }
          setOpen((value) => !value);
        }}
      >
        <svg viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 1.5a3.5 3.5 0 0 0-3.5 3.5v2L2 9.5h10L10.5 7V5A3.5 3.5 0 0 0 7 1.5zM5.5 10.5a1.5 1.5 0 0 0 3 0" />
        </svg>
        {unread ? <span className="c2-bell-count">{unread}</span> : null}
      </button>
      {open ? (
        <div className="c2-pop c2-notes" id={panelId} role="dialog" aria-label="Notifications">
          <p className="c2-notes-k">From this browser&apos;s story</p>
          {notes.length === 0 ? (
            <p className="c2-notes-empty">No notifications yet. They show up when the story moves: a request, an open, a reply, or a revoke.</p>
          ) : (
            <ul>
              {notes.map((note) => (
                <li key={note.id}>
                  <Link href={note.href} onClick={() => setOpen(false)}>
                    <strong>{note.title}</strong>
                    <span>{note.detail}</span>
                  </Link>
                  {note.tx ? (
                    <a href={txExplorerHref(note.tx)} target="_blank" rel="noreferrer">
                      Transaction on the testnet explorer
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
