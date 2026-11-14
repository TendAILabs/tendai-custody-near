export const ASSIST_ROLES = ["visitor", "patient", "clinic", "hospital", "second", "app", "proof"] as const;

export type AssistRole = (typeof ASSIST_ROLES)[number];

export type AssistTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AssistModelResult = {
  text: string;
  signatureKind: string;
  signer: string;
  requestHash: string;
  responseHash: string;
  receiptJson: string;
};

export type AssistAnswerInput = {
  system: string;
  turns: AssistTurn[];
  maxTokens: number;
  model: string;
};

export type AssistAnswer = (input: AssistAnswerInput) => Promise<AssistModelResult>;
