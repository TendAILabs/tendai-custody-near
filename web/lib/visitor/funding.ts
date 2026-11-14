import { randomBytes } from "node:crypto";
import type { HitStore } from "../guard/visitor.ts";
import { onceFor } from "../store/once.ts";
import { faucetFundingKey } from "./limits.ts";

const FUNDED_TTL_SECONDS = 60 * 60 * 24 * 30;

export const BALANCE_UNKNOWN = "Account balance is unknown. No new funds were sent.";
export const TRANSFER_UNCONFIRMED = "The faucet transfer is unconfirmed. No new funds were sent.";

export type TxStatus = "success" | "failure" | "unknown";

export type FundingClaim = {
  state: "pending" | "settled";
  intentId: string;
  txHash: string;
};

export type FundingOutcome =
  | { action: "sent"; txHash: string }
  | { action: "already"; txHash: string }
  | { action: "pending"; held: boolean }
  | { action: "unknown" }
  | { action: "low" };

function parseClaim(value: string | null): FundingClaim | null {
  if (!value) return null;
  if (value === "settled") return { state: "settled", intentId: "", txHash: "" };
  try {
    const parsed = JSON.parse(value) as Partial<FundingClaim>;
    if (parsed.state !== "pending" && parsed.state !== "settled") return { state: "pending", intentId: "", txHash: "" };
    return {
      state: parsed.state,
      intentId: typeof parsed.intentId === "string" ? parsed.intentId : "",
      txHash: typeof parsed.txHash === "string" ? parsed.txHash : "",
    };
  } catch {
    return { state: "pending", intentId: "", txHash: "" };
  }
}

async function writeClaim(store: HitStore, accountId: string, claim: FundingClaim): Promise<void> {
  await onceFor(store).set(faucetFundingKey(accountId), JSON.stringify(claim), FUNDED_TTL_SECONDS);
}

export async function attachFundingTx(store: HitStore, accountId: string, txHash: string): Promise<void> {
  const claim = await readFundingClaim(store, accountId);
  if (!claim) return;
  await writeClaim(store, accountId, { ...claim, state: "pending", txHash });
}

export async function readFundingClaim(store: HitStore, accountId: string): Promise<FundingClaim | null> {
  return parseClaim(await onceFor(store).get(faucetFundingKey(accountId)));
}

export async function beginFunding(store: HitStore, accountId: string, intentId: string): Promise<"begun" | "pending" | "settled"> {
  const fresh: FundingClaim = { state: "pending", intentId, txHash: "" };
  const won = await onceFor(store).claim(faucetFundingKey(accountId), JSON.stringify(fresh), FUNDED_TTL_SECONDS);
  if (won) return "begun";
  const existing = await readFundingClaim(store, accountId);
  if (existing?.state === "settled") return "settled";
  return "pending";
}

async function readBalance(read: () => Promise<bigint>): Promise<bigint | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/**
 * A thrown transfer stays pending. A later call settles from a known balance or a
 * known transaction status, and it does not send a second transfer while the
 * balance cannot be read.
 */
export async function fundVisitor(input: {
  store: HitStore;
  accountId: string;
  visitorFloor: bigint;
  amount: bigint;
  visitorBalance: () => Promise<bigint>;
  faucetBalance?: () => Promise<bigint>;
  faucetFloor?: bigint;
  transfer: (amount: bigint) => Promise<string>;
  txStatus?: (hash: string) => Promise<TxStatus>;
}): Promise<FundingOutcome> {
  const existing = await readFundingClaim(input.store, input.accountId);
  if (existing?.state === "settled") return { action: "already", txHash: existing.txHash };
  if (existing?.state === "pending") {
    const settled = await reconcilePending(input, existing);
    if (settled === "settled") {
      const claim = await readFundingClaim(input.store, input.accountId);
      return { action: "already", txHash: claim?.txHash ?? existing.txHash };
    }
    if (settled === "unknown" || settled === "pending") return { action: "pending", held: false };
  }
  const balance = await readBalance(input.visitorBalance);
  if (balance == null) return { action: "unknown" };
  if (balance >= input.visitorFloor) return { action: "already", txHash: "" };
  const intentId = randomBytes(8).toString("hex");
  const begun = await beginFunding(input.store, input.accountId, intentId);
  if (begun === "settled") return { action: "already", txHash: "" };
  if (begun === "pending") return { action: "pending", held: false };
  if (input.faucetBalance) {
    let faucetYocto: bigint | null = null;
    try {
      faucetYocto = await input.faucetBalance();
    } catch {
      await onceFor(input.store).release(faucetFundingKey(input.accountId));
      return { action: "unknown" };
    }
    if (faucetYocto < (input.faucetFloor ?? input.visitorFloor)) {
      await onceFor(input.store).release(faucetFundingKey(input.accountId));
      return { action: "low" };
    }
  }
  try {
    const txHash = await input.transfer(input.amount);
    await writeClaim(input.store, input.accountId, { state: "settled", intentId, txHash });
    return { action: "sent", txHash };
  } catch {
    return { action: "pending", held: true };
  }
}

async function reconcilePending(
  input: {
    store: HitStore;
    accountId: string;
    visitorFloor: bigint;
    txStatus?: (hash: string) => Promise<TxStatus>;
    visitorBalance: () => Promise<bigint>;
  },
  claim: FundingClaim,
): Promise<"settled" | "pending" | "unknown" | "failed"> {
  const balance = await readBalance(input.visitorBalance);
  if (balance == null) return "unknown";
  if (balance >= input.visitorFloor) {
    await writeClaim(input.store, input.accountId, { ...claim, state: "settled" });
    return "settled";
  }
  if (claim.txHash && input.txStatus) {
    let status: TxStatus = "unknown";
    try {
      status = await input.txStatus(claim.txHash);
    } catch {
      status = "unknown";
    }
    if (status === "success") {
      await writeClaim(input.store, input.accountId, { ...claim, state: "settled" });
      return "settled";
    }
    if (status === "failure") {
      await onceFor(input.store).release(faucetFundingKey(input.accountId));
      return "failed";
    }
  }
  return "pending";
}
