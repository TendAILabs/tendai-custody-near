// Names only. The values stay in the process environment and are never logged.

export const FAUCET_ACCOUNT_ENV = "RELAY_FAUCET_ACCOUNT_ID";
export const FAUCET_KEY_ENV = "RELAY_FAUCET_PRIVATE_KEY";

export function faucetConfigured(): boolean {
  const accountId = process.env[FAUCET_ACCOUNT_ENV] ?? "";
  const key = process.env[FAUCET_KEY_ENV] ?? "";
  return accountId.length > 0 && key.length > 0;
}

export function faucetAccountId(): string {
  return process.env[FAUCET_ACCOUNT_ENV] ?? "";
}
