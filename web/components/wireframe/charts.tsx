"use client";

import type { ReactNode } from "react";
import { useClientMounted } from "@/lib/client-mounted";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, Pill } from "./ui";

const COLORS = ["#0c6e6a", "#c9842a", "#1f7a4d", "#6d3ea8", "#2a4e9a"];

export function useChartReady(): boolean {
  return useClientMounted();
}

function donutStops(slices: { value: number }[], total: number): string[] {
  const ends = slices.reduce<number[]>((acc, slice) => {
    const prev = acc.at(-1) ?? 0;
    return [...acc, prev + (slice.value / total) * 100];
  }, []);
  return ends.map((end, index) => {
    const start = ends[index - 1] ?? 0;
    return `${COLORS[index % COLORS.length]} ${start}% ${end}%`;
  });
}

export function ChartCard({
  title,
  note,
  children,
  height = 208,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  height?: number;
}) {
  return (
    <Card title={title} extra={<Pill tone="example">EXAMPLE</Pill>}>
      {note ? <p className="mb-3 text-xs leading-5 text-[var(--muted)]">{note}</p> : null}
      <div style={{ height }}>{children}</div>
    </Card>
  );
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  color: "var(--ink)",
  fontSize: 12,
};

export function FunnelChart({ data }: { data: { stage: string; value: number }[] }) {
  const ready = useChartReady();
  if (!ready) return <div className="h-full" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 16, right: 8 }}>
        <CartesianGrid stroke="var(--line)" horizontal={false} />
        <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 12 }} allowDecimals={false} />
        <YAxis type="category" dataKey="stage" width={80} tick={{ fill: "var(--muted)", fontSize: 12 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" fill="#0c6e6a" radius={[0, 8, 8, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DayBars({ data }: { data: { day: string; value: number }[] }) {
  const ready = useChartReady();
  if (!ready) return <div className="h-full" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 12 }} />
        <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" fill="#0c6e6a" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ data }: { data: { d: string; n: number }[] }) {
  const ready = useChartReady();
  if (!ready) return <div className="h-full" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="d" tick={{ fill: "var(--muted)", fontSize: 12 }} />
        <YAxis domain={[0, 4]} tick={{ fill: "var(--muted)", fontSize: 12 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="linear" dataKey="n" stroke="#c9842a" strokeWidth={2.5} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data }: { data: { name: string; value: number }[] }) {
  const slices = data.filter((item) => item.value > 0);
  const total = slices.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return <p className="text-sm text-[var(--muted)]">No active holders yet.</p>;
  const stops = donutStops(slices, total);
  return (
    <div
      className="mx-auto grid h-40 w-40 place-items-center rounded-full"
      style={{ background: `conic-gradient(${stops.join(", ")})` }}
      role="img"
      aria-label={slices.map((slice) => `${slice.name} ${slice.value}`).join(", ")}
    >
      <div className="h-20 w-20 rounded-full bg-[var(--card)]" />
    </div>
  );
}

export function VitalsChart({ data }: { data: { day: string; systolic: number; ldl: number }[] }) {
  const ready = useChartReady();
  if (!ready) return <div className="h-full" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 12 }} />
        <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="systolic" stroke="#0c6e6a" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="ldl" stroke="#c9842a" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Gauge({ label, value, max, measured = false }: { label: string; value: number; max: number; measured?: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div>
      <p className="text-5xl font-semibold tracking-[-0.04em]">{measured ? value.toFixed(1) : "0"}s</p>
      <p className="mt-1 text-sm font-semibold">{label}</p>
      <div className="my-4 h-1.5 overflow-hidden rounded-[3px] bg-[var(--line)]" aria-hidden="true">
        <i className="block h-full rounded-[3px] bg-[var(--teal)]" style={{ width: `${measured ? pct : 0}%` }} />
      </div>
      <p className="text-[14.5px] leading-normal text-[var(--muted)]">
        {measured ? `Measured round trip, ${value.toFixed(1)} seconds.` : "No summary has been measured yet."}
      </p>
    </div>
  );
}
