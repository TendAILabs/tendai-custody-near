import { JsonRpcProvider } from "near-api-js";

function rpcUrl(): string {
  const url = process.env.NEAR_RPC_URL;
  if (!url) throw new Error("Missing NEAR_RPC_URL");
  return url;
}

export async function viewContract<T>(method: string, args: Record<string, unknown>): Promise<T> {
  const provider = new JsonRpcProvider({ url: rpcUrl() });
  return provider.callFunction({
    contractId: process.env.RELAY_CONTRACT_ID ?? "",
    method,
    args,
  }) as Promise<T>;
}
