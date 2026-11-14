import { nearProvider } from "./provider.ts";

export async function viewContract<T>(method: string, args: Record<string, unknown>): Promise<T> {
  const provider = nearProvider();
  return provider.callFunction({
    contractId: process.env.RELAY_CONTRACT_ID ?? "",
    method,
    args,
  }) as Promise<T>;
}
