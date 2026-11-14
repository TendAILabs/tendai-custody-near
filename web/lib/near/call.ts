import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";

const RPC_URL = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
const CREATION = new Set(["create_record", "request_referral", "create_share", "submit_reply"]);

type RawOutcome = {
  status?: { SuccessValue?: string; Failure?: { error_message?: string } };
  transaction_outcome?: { id?: string };
};

export type ContractCallInput = {
  accountId: string;
  secret: string;
  methodName: string;
  args: Record<string, unknown>;
  deposit: bigint;
};

/** A chain call failed. `definite` means the contract rejected the args. `retried` means the lost-response retry already ran. */
export class ContractCallError extends Error {
  readonly definite: boolean;
  readonly retried: boolean;
  readonly txHash?: string;

  constructor(message: string, definite: boolean, retried = false, txHash?: string) {
    super(message);
    this.name = "ContractCallError";
    this.definite = definite;
    this.retried = retried;
    if (txHash) this.txHash = txHash;
  }
}

function txHashOf(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("txHash" in error)) return undefined;
  const hash = (error as { txHash?: unknown }).txHash;
  return typeof hash === "string" && hash ? hash : undefined;
}

function contractCode(text: string): string | null {
  return /ERR_[A-Z0-9_]+/.exec(text)?.[0] ?? null;
}

async function callOnce(input: ContractCallInput): Promise<{ hash: string; value: unknown }> {
  const account = new Account(input.accountId, new JsonRpcProvider({ url: RPC_URL }), input.secret as KeyPairString);
  let raw: RawOutcome;
  try {
    raw = (await account.callFunctionRaw({
      contractId: process.env.RELAY_CONTRACT_ID ?? "",
      methodName: input.methodName,
      args: input.args,
      deposit: input.deposit,
      gas: "100000000000000",
    })) as RawOutcome;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    const code = contractCode(text);
    throw new ContractCallError(code ?? "sign failed", code !== null, false, txHashOf(error));
  }
  const failure = raw.status?.Failure?.error_message;
  if (failure) {
    const code = contractCode(failure);
    throw new ContractCallError(code ?? "sign failed", code !== null, false, raw.transaction_outcome?.id);
  }
  const encoded = raw.status?.SuccessValue ?? "";
  const text = encoded ? Buffer.from(encoded, "base64").toString("utf8") : "";
  return { hash: raw.transaction_outcome?.id ?? "", value: text ? JSON.parse(text) : null };
}

export async function callContract(input: ContractCallInput): Promise<{ hash: string; value: unknown }> {
  try {
    return await callOnce(input);
  } catch (error) {
    if (!(error instanceof ContractCallError) || error.definite || !CREATION.has(input.methodName)) throw error;
    try {
      return await callOnce(input);
    } catch (retryError) {
      if (retryError instanceof ContractCallError) {
        throw new ContractCallError(retryError.message, retryError.definite, true, retryError.txHash);
      }
      throw retryError;
    }
  }
}
