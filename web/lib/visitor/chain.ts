import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";
import { faucetAccountId } from "./faucet-env.ts";

const RPC_URL = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";

type Outcome = {
  transaction_outcome?: { id?: string };
  transaction?: { hash?: string };
  status?: { SuccessValue?: string; Failure?: { error_message?: string } };
};

function txHash(raw: Outcome): string {
  return raw.transaction_outcome?.id ?? raw.transaction?.hash ?? "";
}

export async function readBalanceYocto(accountId: string): Promise<bigint> {
  const provider = new JsonRpcProvider({ url: RPC_URL });
  const view = await provider.viewAccount({ accountId });
  return view.amount;
}

export async function transferFromFaucet(to: string, yocto: bigint): Promise<string> {
  const accountId = faucetAccountId();
  const secret = process.env.RELAY_FAUCET_PRIVATE_KEY ?? "";
  if (!accountId || !secret) throw new Error("faucet not configured");
  const account = new Account(accountId, new JsonRpcProvider({ url: RPC_URL }), secret as KeyPairString);
  const raw = (await account.transfer({ receiverId: to, amount: yocto })) as Outcome;
  return txHash(raw);
}
