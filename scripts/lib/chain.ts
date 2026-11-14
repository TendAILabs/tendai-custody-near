import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";

export const RPC_URL = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";

export function provider(): JsonRpcProvider {
  return new JsonRpcProvider({ url: RPC_URL });
}

export function signer(accountId: string, secret: string): Account {
  return new Account(accountId, provider(), secret as KeyPairString);
}

type RawOutcome = {
  status?: { SuccessValue?: string; Failure?: { error_message?: string } };
  transaction_outcome?: { id?: string; outcome?: { logs?: string[] } };
  receipts_outcome?: { id?: string; outcome?: { logs?: string[] } }[];
};

export type TxResult = {
  hash: string;
  value: unknown;
  logs: string[];
};

export async function call(
  account: Account,
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
  deposit: bigint,
): Promise<TxResult> {
  const raw = (await account.callFunctionRaw({
    contractId,
    methodName,
    args,
    deposit,
    gas: "100000000000000",
  })) as RawOutcome;
  const failure = raw.status?.Failure?.error_message;
  if (failure) {
    const error = new Error(failure);
    (error as Error & { hash?: string }).hash = raw.transaction_outcome?.id;
    throw error;
  }
  const encoded = raw.status?.SuccessValue ?? "";
  const text = encoded ? Buffer.from(encoded, "base64").toString("utf8") : "";
  const logs = [
    ...(raw.transaction_outcome?.outcome?.logs ?? []),
    ...(raw.receipts_outcome ?? []).flatMap((receipt) => receipt.outcome?.logs ?? []),
  ];
  return {
    hash: raw.transaction_outcome?.id ?? "",
    value: text ? JSON.parse(text) : null,
    logs,
  };
}

export async function view<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
  return (await provider().callFunction({
    contractId,
    method,
    args,
  })) as T;
}

export async function availableNear(accountId: string): Promise<number> {
  const account = new Account(accountId, provider());
  const state = await account.getState();
  return Number(state.balance.available) / 1e24;
}
