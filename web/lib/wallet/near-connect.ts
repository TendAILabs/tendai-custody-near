import { outcomeOf, type BroadcastCall } from "./patient-sign.ts";
import { networkWarning } from "./network.ts";

export type ConnectedWallet = {
  accountId: string;
  network: string;
  warning: string;
  signMessage: (input: { message: string; recipient: string; nonce: Uint8Array }) => Promise<{ accountId: string; publicKey: string; signature: string }>;
  signCall: (contractId: string, call: BroadcastCall) => Promise<{ hash: string; value: unknown }>;
  disconnect: () => Promise<void>;
};

let current: ConnectedWallet | null = null;

export function connectedWallet(): ConnectedWallet | null {
  return current;
}

export async function connectTestnetWallet(): Promise<ConnectedWallet> {
  const { NearConnector } = await import("@hot-labs/near-connect");
  const connector = new NearConnector({
    network: "testnet",
    features: {
      signMessage: true,
      signAndSendTransaction: true,
    },
  });
  const wallet = await connector.connect();
  const accounts = await wallet.getAccounts();
  const accountId = accounts[0]?.accountId ?? "";
  const network = connector.network;
  const connected: ConnectedWallet = {
    accountId,
    network,
    warning: networkWarning(accountId, network),
    async signMessage(input) {
      const signed = await wallet.signMessage({
        message: input.message,
        recipient: input.recipient,
        nonce: input.nonce,
        network: "testnet",
        signerId: accountId,
      });
      return { accountId: signed.accountId || accountId, publicKey: signed.publicKey, signature: signed.signature };
    },
    async signCall(contractId, call) {
      const raw = await wallet.signAndSendTransaction({
        network: "testnet",
        signerId: accountId,
        receiverId: contractId,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: call.methodName,
              args: call.args,
              gas: "100000000000000",
              deposit: call.deposit.toString(),
            },
          },
        ],
      });
      return outcomeOf(raw as never);
    },
    async disconnect() {
      await connector.disconnect(wallet);
      if (current === connected) current = null;
    },
  };
  current = connected;
  return connected;
}

export async function disconnectTestnetWallet(): Promise<void> {
  if (!current) return;
  await current.disconnect();
  current = null;
}
