"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ORG, PEOPLE } from "@/lib/fixtures";
import { useStory } from "@/lib/story-context";
import { PhoneApp } from "./phone-app";
import { Pill } from "./ui";

export function RecordsScreen({ titleAs: _titleAs = "h1" }: { titleAs?: "h1" | "h2" }) {
  const { state } = useStory();
  const rows = [
    {
      id: "riverbend",
      source: ORG.clinic,
      date: "2026-11-12",
      type: "Chart",
      show: true,
    },
    {
      id: "staster",
      source: ORG.hospital,
      date: "2026-11-12",
      type: "Consult note",
      show: state.consultSent,
    },
    {
      id: "reyes",
      source: ORG.second,
      date: "2026-11-12",
      type: "Second opinion",
      show: state.secondReplySent,
    },
  ].filter((row) => row.show);

  return (
    <PhoneApp>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--teal)]">Patient</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your records on this device</h1>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            <b>What this is: </b>These are the chart sections held for Maya on this device.
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            <b>What you can do: </b>You can read them here, and you can start a second opinion or a copy for an app.
          </p>
        </div>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/patient/records/${row.id}`}
                data-testid={`record-${row.id}`}
                className="flex items-center gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{row.source}</p>
                  <p className="text-xs text-[var(--muted)]">{row.date}</p>
                  <div className="mt-2">
                    <Pill tone="neutral">{row.type}</Pill>
                  </div>
                </div>
                <ChevronRight size={18} className="text-[var(--muted)]" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
        {!state.consultSent ? (
          <p className="text-xs leading-5 text-[var(--muted)]">
            A note from {PEOPLE.arjun} appears here after the hospital replies.
          </p>
        ) : null}
      </div>
    </PhoneApp>
  );
}
