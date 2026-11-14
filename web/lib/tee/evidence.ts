export type TeeServerEvidence = {
  gatewayTcb: string;
  gatewaySigner: string;
  gatewayTls: string;
  modelTcb: string;
  modelGpu: string;
  modelSigner: string;
};

export const SERVER_EVIDENCE_LABEL = "verified by our server via the NEAR AI SDK at call time";

const UNCHECKED = /^(none|not_provided|not checked)$/i;

export function blankTeeEvidence(): TeeServerEvidence {
  return {
    gatewayTcb: "",
    gatewaySigner: "",
    gatewayTls: "",
    modelTcb: "",
    modelGpu: "",
    modelSigner: "",
  };
}

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 160) return "";
  if (/private|secret|BEGIN /i.test(trimmed)) return "";
  return trimmed;
}

export function readTeeEvidence(raw: unknown): TeeServerEvidence | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const evidence: TeeServerEvidence = {
    gatewayTcb: clean(row.gatewayTcb),
    gatewaySigner: clean(row.gatewaySigner),
    gatewayTls: clean(row.gatewayTls),
    modelTcb: clean(row.modelTcb),
    modelGpu: clean(row.modelGpu),
    modelSigner: clean(row.modelSigner),
  };
  if (Object.values(evidence).every((value) => value === "")) return null;
  return evidence;
}

export function evidencePresent(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed || UNCHECKED.test(trimmed)) return null;
  return trimmed;
}

export function evidencePhrase(label: string, value: string | undefined): string {
  const shown = evidencePresent(value);
  if (!shown) return `${label}: Not checked.`;
  return `${label}: ${shown}. ${SERVER_EVIDENCE_LABEL}.`;
}
