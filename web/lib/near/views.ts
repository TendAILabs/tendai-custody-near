import { rpcPost } from "./rpc-fetch.ts";

export async function viewMethod<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
  const { payload: raw } = await rpcPost({
    jsonrpc: "2.0",
    id: "view",
    method: "query",
    params: {
      request_type: "call_function",
      account_id: contractId,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      finality: "optimistic",
    },
  });
  const payload = raw as {
    error?: { message?: string };
    result?: { result?: number[]; error?: string };
  };
  if (payload.error) throw new Error(payload.error.message ?? "rpc error");
  if (!payload.result || payload.result.error) throw new Error(payload.result?.error ?? "view failed");
  const bytes = Uint8Array.from(payload.result.result ?? []);
  const text = new TextDecoder().decode(bytes);
  if (!text) return null as T;
  return JSON.parse(text) as T;
}
