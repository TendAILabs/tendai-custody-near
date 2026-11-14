import { createElement, type CSSProperties } from "react";

const style: CSSProperties = {
  margin: "8px 0 0",
  fontFamily: "var(--sans)",
  fontSize: 13,
  lineHeight: 1.45,
  color: "#A9B6CC",
};

export function IdentifierBestEffort({ verified }: { verified: boolean }) {
  if (!verified) return null;
  return createElement("p", { "data-testid": "identifier-best-effort", style }, "Identifier check is best effort.");
}
