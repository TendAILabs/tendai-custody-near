// The app already links to testnet NearBlocks. explorer.testnet.near.org now
// opens an explorer picker ("Choose from the available NEAR Explorers") instead
// of the account or the transaction. Do not build that host here.

export const TESTNET_EXPLORER_ORIGIN = "https://testnet.nearblocks.io";

const TX_HASH = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ACCOUNT = /^(?:[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]|[0-9a-f]{64})$/;

export function isTxHash(value: string | null | undefined): value is string {
  return typeof value === "string" && TX_HASH.test(value);
}

export function isAccountId(value: string | null | undefined): value is string {
  return typeof value === "string" && ACCOUNT.test(value);
}

export function accountUrl(accountId: string): string {
  return `${TESTNET_EXPLORER_ORIGIN}/address/${encodeURIComponent(accountId)}`;
}

export function txUrl(txHash: string): string {
  return `${TESTNET_EXPLORER_ORIGIN}/txns/${encodeURIComponent(txHash)}`;
}

export type ExplorerLink = {
  href: string;
  kind: "tx" | "account" | "contract";
  label: string;
};

export function eventExplorer(input: {
  tx?: string | null;
  accountId?: string | null;
  contractId?: string | null;
}): ExplorerLink {
  if (isTxHash(input.tx)) {
    return { href: txUrl(input.tx), kind: "tx", label: "Transaction on the testnet explorer" };
  }
  if (isAccountId(input.accountId)) {
    return { href: accountUrl(input.accountId), kind: "account", label: "Account on the testnet explorer" };
  }
  if (isAccountId(input.contractId)) {
    return { href: accountUrl(input.contractId), kind: "contract", label: "Contract on the testnet explorer" };
  }
  return { href: TESTNET_EXPLORER_ORIGIN, kind: "contract", label: "Testnet explorer" };
}
