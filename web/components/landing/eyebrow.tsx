import type { ReactNode } from "react";

export function Eyebrow({ ix, label, extra }: { ix: string; label: string; extra?: ReactNode }) {
  return (
    <span className="eyebrow">
      <span className="ix">{ix}</span>
      <span className="sep">/</span>
      <span className="lbl">{label}</span>
      {extra}
    </span>
  );
}
