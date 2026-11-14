export const REPLAYED_SUMMARY = {
  label: "Replayed" as const,
  model: "z-ai/glm-5.3-flash",
  signatureKind: "provider_tee" as const,
  gatewayTcb: "UpToDate",
  modelTcb: "UpToDate",
  tls: "attested",
  gpu: "verified",
  completionTokens: 903,
  latencyMs: 33_000,
  note: "Cached from a live full-reasoning run on 2026-11-09. This page did not call NEAR AI to show it.",
};

export const REPLAYED_DEID = {
  label: "Replayed" as const,
  maxTokens: 4096,
  reasoningTokens: 1388,
  fixtureIdentifiers: 0,
  privacySpans: 0,
  shareAllowed: true,
  latencyMs: 42_000,
  note: "The same live run failed at max_tokens 1500 with an empty answer. 4096 returned JSON, no fixture identifiers, and no privacy-filter spans.",
};
