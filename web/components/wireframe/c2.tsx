"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Story } from "@/lib/story";

export function Arrow() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true">
      <path d="M1 7h11M8 3l4 4-4 4" />
    </svg>
  );
}

export function Tick() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1 5l3 3 5-6" />
    </svg>
  );
}

export function shortId(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function txHref(tx: string): string {
  return `https://testnet.nearblocks.io/txns/${tx}`;
}

type NodeKey = "clinic" | "patient" | "hospital" | "reyes" | "app";
type NodeState = "idle" | "active" | "done" | "revoked" | "broken";

const HUE: Record<NodeKey, string> = {
  clinic: "#0D9488",
  patient: "#0F172A",
  hospital: "#3B82F6",
  reyes: "#7C3AED",
  app: "#F59E0B",
};

export function relayStates(state: Story): Record<NodeKey, NodeState> {
  const hospital: NodeState = state.tamper
    ? "broken"
    : state.revoked.referral
      ? "revoked"
      : state.hospitalOpened
        ? "done"
        : state.consentStatus === "active"
          ? "active"
          : "idle";
  return {
    clinic: state.referralSent ? "done" : "active",
    patient:
      state.consentStatus === "active" || state.consentStatus === "declined"
        ? "done"
        : state.referralSent
          ? "active"
          : "idle",
    hospital,
    reyes: state.revoked.second ? "revoked" : state.secondSent ? "done" : "idle",
    app: state.revoked.deid ? "revoked" : state.deidSent ? "done" : "idle",
  };
}

function glyph(key: NodeKey, x: number, y: number, color: string) {
  if (key === "clinic") return <path d={`M${x - 4} ${y}h8M${x} ${y - 4}v8`} stroke={color} strokeWidth="2" strokeLinecap="square" />;
  if (key === "patient") return <circle cx={x} cy={y} r="3.2" fill={color} />;
  if (key === "hospital") {
    return <path d={`M${x - 3.5} ${y - 4}v8M${x + 3.5} ${y - 4}v8M${x - 3.5} ${y}h7`} stroke={color} strokeWidth="2" strokeLinecap="square" />;
  }
  if (key === "reyes") {
    return (
      <>
        <circle cx={x - 3} cy={y} r="2.2" fill={color} />
        <circle cx={x + 3} cy={y} r="2.2" fill={color} />
      </>
    );
  }
  return <rect x={x - 3.5} y={y - 3.5} width="7" height="7" fill={color} />;
}

function RelayNode({
  id,
  x,
  y,
  label,
  lx,
  ly,
  anchor,
  status,
}: {
  id: NodeKey;
  x: number;
  y: number;
  label: string;
  lx: number;
  ly: number;
  anchor: "middle" | "start";
  status: NodeState;
}) {
  const hue = HUE[id];
  const ring = status === "idle" ? `${hue}70` : status === "revoked" || status === "broken" ? "#C4261D" : hue;
  const fill = status === "done" ? hue : status === "revoked" ? "#C4261D" : "#fff";
  const ink = status === "done" || status === "revoked" ? "#fff" : status === "idle" ? "#9AA4B6" : "#0F172A";
  return (
    <g>
      {status === "active" ? <circle className="pulse" cx={x} cy={y} r="11" fill="none" stroke={hue} strokeWidth="2" /> : null}
      <circle cx={x} cy={y} r="11" fill={fill} stroke={ring} strokeWidth="2.5" />
      {glyph(id, x, y, ink)}
      <text x={lx} y={ly} textAnchor={anchor} fontFamily="var(--font-plex-mono), ui-monospace, Menlo, monospace" fontSize="9" fontWeight="500" letterSpacing="0.8" fill={status === "idle" ? "#7A8499" : "#0F172A"}>
        {label}
      </text>
    </g>
  );
}

export function RelayMap({ state }: { state: Story }) {
  const st = relayStates(state);
  const col = (key: NodeKey) => (st[key] === "revoked" || st[key] === "broken" ? "#C4261D" : st[key] === "idle" ? `${HUE[key]}70` : HUE[key]);
  const width = (key: NodeKey) => (st[key] === "idle" ? 1.75 : 3);
  const dash = (key: NodeKey) => (st[key] === "idle" ? "4 5" : undefined);
  return (
    <div className="c2-relay">
      <svg viewBox="0 0 340 126" role="img" aria-label="Relay map">
        <path className={st.clinic === "idle" ? undefined : "ln-draw"} pathLength={1} d="M31 60H101" fill="none" stroke={st.clinic === "done" ? HUE.clinic : "#C9D0DB"} strokeWidth={st.clinic === "done" ? 3 : 1.75} strokeDasharray={st.clinic === "done" ? undefined : "4 5"} strokeLinecap="round" />
        <path className={st.patient === "idle" ? undefined : "ln-draw"} pathLength={1} d="M123 60H150" fill="none" stroke={st.patient === "done" ? "#0F172A" : "#C9D0DB"} strokeWidth={st.patient === "done" ? 3 : 1.75} strokeDasharray={st.patient === "done" ? undefined : "4 5"} strokeLinecap="round" />
        <path className={st.hospital === "idle" ? undefined : "ln-draw"} pathLength={1} d="M150 60Q160 60 160 50V32Q160 22 170 22H215" fill="none" stroke={col("hospital")} strokeWidth={width("hospital")} strokeDasharray={dash("hospital")} strokeLinecap="round" />
        <path className={st.reyes === "idle" ? undefined : "ln-draw"} pathLength={1} d="M150 60H215" fill="none" stroke={col("reyes")} strokeWidth={width("reyes")} strokeDasharray={dash("reyes")} strokeLinecap="round" />
        <path className={st.app === "idle" ? undefined : "ln-draw"} pathLength={1} d="M150 60Q160 60 160 70V88Q160 98 170 98H215" fill="none" stroke={col("app")} strokeWidth={width("app")} strokeDasharray={dash("app")} strokeLinecap="round" />
        {st.hospital === "broken" ? (
          <g stroke="#C4261D" strokeWidth="3" strokeLinecap="square">
            <path d="M156 33l8 8M164 33l-8 8" />
          </g>
        ) : null}
        <RelayNode id="clinic" x={20} y={60} label="RIVERBEND" lx={2} ly={88} anchor="start" status={st.clinic} />
        <RelayNode id="patient" x={112} y={60} label="MAYA" lx={112} ly={88} anchor="middle" status={st.patient} />
        <RelayNode id="hospital" x={226} y={22} label="ST. ASTER" lx={244} ly={25} anchor="start" status={st.hospital} />
        <RelayNode id="reyes" x={226} y={60} label="DR. REYES" lx={244} ly={63} anchor="start" status={st.reyes} />
        <RelayNode id="app" x={226} y={98} label="PULSEFIT" lx={244} ly={101} anchor="start" status={st.app} />
      </svg>
      <div className="cap">Relay map · live story</div>
    </div>
  );
}

export function PageHead({
  index = "",
  eyebrow,
  title,
  mark,
  second,
  lede = "",
  what,
  can,
  state,
  bad = false,
}: {
  index?: string;
  eyebrow: string;
  title: ReactNode;
  mark?: string;
  second?: ReactNode;
  lede?: string;
  what?: string;
  can?: string;
  state: Story;
  bad?: boolean;
}) {
  return (
    <header className={bad ? "c2-ph bad" : "c2-ph"}>
      <div className="c2-ph-l">
        <div className="c2-eye">
          {index ? (
            <>
              <b>{index}</b>
              <i />
            </>
          ) : null}
          {eyebrow}
        </div>
        <h1>
          <span className="c2-ln">
            <span style={{ ["--i" as string]: 0 }}>{title}{mark ? <> <mark className={bad ? "c2-mark red" : "c2-mark"}>{mark}</mark></> : null}</span>
          </span>
          {second ? (
            <span className="c2-ln">
              <span style={{ ["--i" as string]: 1 }}>{second}</span>
            </span>
          ) : null}
        </h1>
        {what ? (
          <p className="c2-purpose">
            <b>What this is: </b>
            {what}
          </p>
        ) : null}
        {can ? (
          <p className="c2-purpose">
            <b>What you can do: </b>
            {can}
          </p>
        ) : null}
        {lede ? <p className="c2-lede c2-rv">{lede}</p> : null}
      </div>
      <div className="c2-ph-r">
        <RelayMap state={state} />
      </div>
    </header>
  );
}

export function Section({
  index,
  title,
  aside,
  children,
  bad = false,
  delay = 1,
}: {
  index: string;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  bad?: boolean;
  delay?: number;
}) {
  return (
    <section className="c2-sec c2-rv" style={{ ["--d" as string]: delay }}>
      <div className={bad ? "c2-sec-h bad" : "c2-sec-h"}>
        <span className="t">
          {index} <em>{title}</em>
        </span>
        {aside ? <span className="r">{aside}</span> : null}
      </div>
      <div className="c2-sec-b">{children}</div>
    </section>
  );
}

export function Tag({ children, tone = "quiet", testId }: { children: ReactNode; tone?: "quiet" | "ok" | "bad" | "soft" | "q" | "qbad" | "qmut" | "hosp" | "sec2" | "app" | "cl" | "solid"; testId?: string }) {
  const cls =
    tone === "ok"
      ? "c2-tag ok"
      : tone === "bad"
        ? "c2-tag bad"
        : tone === "soft"
          ? "c2-tag soft-bad"
          : tone === "q"
            ? "c2-tag q"
            : tone === "qbad"
              ? "c2-tag q bad"
              : tone === "qmut"
                ? "c2-tag q mut"
                : tone === "hosp"
                  ? "c2-tag hosp ni"
                  : tone === "sec2"
                    ? "c2-tag sec2 ni"
                    : tone === "app"
                      ? "c2-tag app ni"
                      : tone === "cl"
                        ? "c2-tag cl ni"
                        : tone === "solid"
                          ? "c2-tag ni"
                          : "c2-tag q mut";
  return (
    <span className={cls} data-testid={testId}>
      {children}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  href,
  disabled,
  tone = "ink",
  testId,
  type = "button",
  small = false,
  guide,
  pressed,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  tone?: "ink" | "ghost" | "danger";
  testId?: string;
  type?: "button" | "submit";
  small?: boolean;
  guide?: string;
  pressed?: boolean;
}) {
  const className = `c2-btn${tone === "ghost" ? " ghost" : ""}${tone === "danger" ? " danger" : ""}${small ? " sm" : ""}`;
  if (href) {
    return (
      <Link href={href} className={className} data-testid={testId} data-guide={guide}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled} data-testid={testId} data-guide={guide} aria-pressed={pressed}>
      {children}
    </button>
  );
}

export function HashDiff({ approved, presented }: { approved: string; presented: string }) {
  return (
    <div className="c2-hx">
      {presented.split("").map((char, index) => (
        <span key={`${char}-${index}`} className={approved[index] !== char ? "bad" : undefined}>
          {char}
        </span>
      ))}
    </div>
  );
}
