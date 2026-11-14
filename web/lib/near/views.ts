const RPC_URL = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";

export async function viewMethod<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
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
    }),
  });
  const payload = (await response.json()) as {
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
