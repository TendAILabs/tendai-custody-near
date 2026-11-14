/**
 * Free public NEAR testnet RPC providers, from https://docs.near.org/api/rpc/providers.
 * Order matters: the first healthy entry is used. NEAR_RPC_URL (server only) goes first when set.
 */
export const TESTNET_RPC_URLS: readonly string[] = [
  "https://test.rpc.fastnear.com",
  "https://near-testnet.drpc.org",
  "https://rpc.testnet.near.org",
  "https://api.zan.top/near-testnet",
];

export function rpcUrls(): string[] {
  const custom = typeof process !== "undefined" ? process.env.NEAR_RPC_URL?.trim() : "";
  const list = custom ? [custom, ...TESTNET_RPC_URLS] : [...TESTNET_RPC_URLS];
  return list.filter((url, index) => list.indexOf(url) === index);
}
