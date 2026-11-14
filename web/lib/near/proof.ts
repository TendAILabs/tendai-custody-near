import { evidencePresent, type TeeServerEvidence } from "../tee/evidence.ts";

export type { AttackLine } from "../../content/attack-run.ts";
export { ATTACK_INTRO, ATTACK_LIMIT, ATTACK_LINES } from "../../content/attack-run.ts";

export type CheckState = "pass" | "fail" | "not-run" | "not-checked";

export type VerifyRow = {
  id: string;
  name: string;
  detail: string;
  state: CheckState;
};

export function checkLabel(state: CheckState): string {
  if (state === "pass") return "Pass";
  if (state === "fail") return "Fail";
  if (state === "not-run") return "Not run";
  return "Not checked here";
}

export function verificationRows(input: {
  teeStatus: "idle" | "green" | "red";
  hasParsedReceipt: boolean;
  approveTxKnown: boolean;
  evidence?: TeeServerEvidence | null;
}): VerifyRow[] {
  const gatewayTcb = evidencePresent(input.evidence?.gatewayTcb);
  const gatewayChecked = input.teeStatus === "green" && Boolean(gatewayTcb);
  const signature: VerifyRow = {
    id: "signature",
    name: "Signature kind is provider_tee",
    detail: "The summary call must report provider_tee. That is the only signature check this page computes.",
    state: input.teeStatus === "green" ? "pass" : input.teeStatus === "red" ? "fail" : "not-run",
  };
  return [
    signature,
    {
      id: "nonce",
      name: "Fresh client nonce",
      detail: "This page does not generate or compare a 32-byte nonce.",
      state: "not-checked",
    },
    {
      id: "quote",
      name: "Gateway quote",
      detail: gatewayChecked
        ? `Gateway TCB ${gatewayTcb} was verified by our server via the NEAR AI SDK at call time. This browser did not verify the quote.`
        : "This page does not read a gateway quote or a TCB status.",
      state: gatewayChecked ? "pass" : "not-checked",
    },
    {
      id: "binding",
      name: "Nonce bound to the report",
      detail: "This page does not check that report data binds a nonce.",
      state: "not-checked",
    },
    {
      id: "rtmr",
      name: "Event log and RTMR3",
      detail: "This page does not replay an event log or compare RTMR3.",
      state: "not-checked",
    },
    {
      id: "compose",
      name: "Compose measurement",
      detail: "This page does not compare a compose hash with a measurement.",
      state: "not-checked",
    },
    {
      id: "models",
      name: "Model measurements",
      detail: evidencePresent(input.evidence?.modelTcb) || evidencePresent(input.evidence?.modelGpu)
        ? "Model TCB was accepted by our server via the NEAR AI SDK when this summary succeeded. GPU evidence is listed with the server fields only when the SDK reports it as verified. This page does not compare model measurements, so this row stays unchecked."
        : "This page does not check model measurements or GPU evidence.",
      state: "not-checked",
    },
    {
      id: "e2ee",
      name: "Encrypted to the model key in the browser",
      detail: "In this demo the chart is sent to the app server for the sealed summary. The server turns on NEAR AI SDK encryption for that call. This page does not check browser-side encryption.",
      state: "not-checked",
    },
    {
      id: "hashes",
      name: "Request and response hashes",
      detail: input.hasParsedReceipt
        ? "The hashes above were copied from the receipt the summary call returned. This page does not recompute them."
        : "No receipt hashes are on this page yet. This page does not recompute them.",
      state: "not-checked",
    },
    {
      id: "chain",
      name: "Receipt hash stored on NEAR",
      detail: input.approveTxKnown
        ? "This session saved an approve transaction. This page does not read the contract to confirm the hash stored there."
        : "No approve transaction is saved in this session. This page does not read the contract.",
      state: "not-checked",
    },
  ];
}

