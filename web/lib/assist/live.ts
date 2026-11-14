import { InferenceClient } from "@nearai/inference-sdk/node";
import { assertTeeModel } from "../relay/policy.ts";
import { GLM_REASONING_EFFORT, requireAssistantText } from "../tee/completion.ts";
import { requireNearAiKey } from "../tee/live.ts";
import { assertSpendAllows, recordSpend, releaseUnsentReservation, usdForUsage } from "../tee/spend.ts";
import { hashesFromSignedText } from "./receipt.ts";
import { stripThinkTags } from "./sanitize.ts";
import type { AssistAnswerInput, AssistModelResult } from "./types.ts";

const STRICT_TCB = { acceptedTcbStatuses: ["UpToDate"] as const };

export async function assistCompletion(input: AssistAnswerInput): Promise<AssistModelResult> {
  const model = input.model.trim();
  assertTeeModel(model);
  const prompt = [input.system, ...input.turns.map((turn) => `${turn.role}\n${turn.content}`)].join("\n");
  const price = await assertSpendAllows(model, Math.ceil(prompt.length / 4) + 32, input.maxTokens);
  const reservedMicro = price.reservedMicro ?? 0;
  let sent = false;
  try {
    const near = new InferenceClient({
      apiKey: requireNearAiKey(),
      e2ee: true,
      gatewayVerification: { policy: STRICT_TCB },
      modelVerification: { policy: STRICT_TCB },
    });
    await near.verify(model);
    sent = true;
    const completion = await near.chat.completions.create({
      model,
      messages: [{ role: "system", content: input.system }, ...input.turns],
      stream: false,
      max_tokens: input.maxTokens,
      max_completion_tokens: input.maxTokens,
      reasoning_effort: GLM_REASONING_EFFORT,
    });
    const spent = usdForUsage(price, completion.usage, reservedMicro);
    await recordSpend({
      kind: "chat",
      model,
      promptTokens: spent.promptTokens,
      completionTokens: spent.completionTokens,
      usd: spent.usd,
      reservedMicro,
    });
    const text = stripThinkTags(requireAssistantText(completion, "NEAR AI summary"));
    if (!text) throw new Error("NEAR AI summary stopped before a complete answer (finish_reason=stop, content=empty).");
    if (!completion.id) throw new Error("TEE stream ended without a completion id.");
    const receipt = await near.verifyResponse(completion.id);
    if (receipt.signatureKind !== "provider_tee") {
      throw new Error(`NEAR AI signatureKind=${receipt.signatureKind}. provider_tee is required.`);
    }
    const hashes = hashesFromSignedText(receipt.signature.signedText);
    if (!hashes) throw new Error("NEAR AI signatureKind=provider_tee missing request hash.");
    return {
      text,
      signatureKind: receipt.signatureKind,
      signer: `${receipt.signature.signer.signingAlgo} ${receipt.signature.signer.signingAddress}`,
      requestHash: hashes.requestHash,
      responseHash: hashes.responseHash,
      receiptJson: JSON.stringify({
        tee: true,
        model,
        signatureKind: receipt.signatureKind,
        signer: receipt.signature.signer.signingAddress,
        signedText: receipt.signature.signedText,
      }),
    };
  } finally {
    await releaseUnsentReservation(sent, reservedMicro);
  }
}
