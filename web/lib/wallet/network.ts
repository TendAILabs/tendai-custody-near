export const FAUCET_DOCS_URL = "https://docs.near.org/getting-started/faucet";
export const FAUCET_SITE_URL = "https://near-faucet.io/";
export const EXPLORER_TX = "https://testnet.nearblocks.io/txns/";

export function txUrl(hash: string): string {
  return `${EXPLORER_TX}${hash}`;
}

export function networkWarning(accountId: string, network: string): string {
  if (network !== "testnet") return "This wallet is not on testnet. Switch to testnet before signing.";
  if (accountId.endsWith(".near")) return "This account is a mainnet name. Use a testnet account.";
  return "";
}
