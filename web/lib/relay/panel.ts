export type PanelTone = "green" | "red";

export function verifiedPanelTone(input: { threw?: boolean; signatureKind?: string | null }): PanelTone {
  if (input.threw || input.signatureKind !== "provider_tee") return "red";
  return "green";
}

export function deidSendAllowed(input: {
  scrubbed: string;
  identifiers: string[];
  spans: { score: number }[];
}): boolean {
  for (const value of input.identifiers) {
    const needle = value.trim();
    if (needle.length >= 3 && input.scrubbed.includes(needle)) return false;
  }
  return !input.spans.some((span) => span.score >= 0.5);
}
