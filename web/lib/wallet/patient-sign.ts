import type { LocalDeviceKey } from "./keys.ts";

export type BroadcastCall = {
  accountId: string;
  methodName: string;
  args: Record<string, unknown>;
  deposit: bigint;
};

export async function signLocalCall(
  record: { accountId: string },
  method: string,
  args: Record<string, unknown>,
  depositYocto: string,
  broadcast: (call: BroadcastCall) => Promise<{ hash: string; value: unknown }>,
): Promise<{ hash: string; value: unknown }> {
  return broadcast({
    accountId: record.accountId,
    methodName: method,
    args,
    deposit: BigInt(depositYocto),
  });
}

type Outcome = {
  transaction_outcome?: { id?: string };
  transaction?: { hash?: string };
  status?: { SuccessValue?: string; Failure?: { error_message?: string } };
};

export function outcomeOf(raw: Outcome): { hash: string; value: unknown } {
  const failure = raw.status?.Failure?.error_message;
  if (failure) {
    const code = /ERR_[A-Z0-9_]+/.exec(failure)?.[0] ?? "sign failed";
    throw new Error(code);
  }
  const encoded = raw.status?.SuccessValue ?? "";
  let text = "";
  if (encoded) {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    text = new TextDecoder().decode(bytes);
  }
  return {
    hash: raw.transaction_outcome?.id ?? raw.transaction?.hash ?? "",
    value: text ? JSON.parse(text) : null,
  };
}

export async function broadcastLocal(record: LocalDeviceKey, contractId: string, call: BroadcastCall): Promise<{ hash: string; value: unknown }> {
  const { Account, JsonRpcProvider } = await import("near-api-js");
  const account = new Account(record.accountId, new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" }), record.secret as never);
  const raw = (await account.callFunctionRaw({
    contractId,
    methodName: call.methodName,
    args: call.args,
    deposit: call.deposit,
    gas: "100000000000000",
  })) as Outcome;
  return outcomeOf(raw);
}
