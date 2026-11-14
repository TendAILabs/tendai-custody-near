import { createHash } from "node:crypto";

/**
 * Authorization domain for cookies, receipts, operation state, and open nonces.
 * App environment, network, contract id, and protocol version travel together.
 * Global AI spend and faucet budgets are not part of this domain.
 */
export const PROTOCOL_VERSION = "1";

export type DomainParts = {
  app: string;
  network: string;
  contractId: string;
  protocol: string;
};

export function domainParts(env: NodeJS.ProcessEnv = process.env): DomainParts {
  const app = (env.VERCEL_ENV || "dev").trim() || "dev";
  const network = (env.NEAR_NETWORK || "testnet").trim() || "testnet";
  const contractId = (env.RELAY_CONTRACT_ID || "").trim();
  return { app, network, contractId, protocol: PROTOCOL_VERSION };
}

export function authorizationDomain(env: NodeJS.ProcessEnv = process.env): string {
  const parts = domainParts(env);
  return ["tendai-auth", "v1", parts.app, parts.network, parts.contractId, parts.protocol].join("\n");
}

export function domainTag(env: NodeJS.ProcessEnv = process.env): string {
  return createHash("sha256").update(authorizationDomain(env)).digest("hex").slice(0, 16);
}
