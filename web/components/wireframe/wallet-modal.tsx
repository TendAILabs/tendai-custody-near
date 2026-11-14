"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import type { WalletMethod } from "@/lib/fixtures";
import { clearDemoConfigCache } from "@/lib/relay/flow";
import { browserKeyStore, createLocalDeviceKey, createWalletEncKey } from "@/lib/wallet/keys";
import { signLocalNep413 } from "@/lib/wallet/nep413";
import { connectTestnetWallet, disconnectTestnetWallet } from "@/lib/wallet/near-connect";
import { FAUCET_DOCS_URL, FAUCET_SITE_URL, txUrl } from "@/lib/wallet/network";
import { markSetupDone, pingVisitor } from "@/lib/visitor/use-account";
import { registerDevicePatient } from "@/lib/wallet/client-signer";
import type { VisitorStatus } from "@/lib/visitor/status";
import { Button, Pill } from "./ui";

function signCopy(method: WalletMethod, kind: VisitorStatus["kind"] | undefined): string {
  const action = method.startsWith("revoke") ? "revoke" : method === "decline_share" ? "decline" : method === "create_share" ? "share" : "approval";
  const signer = kind === "demo-server" ? "The demo server key" : kind === "local-key" ? "The key on this device" : "Your wallet";
  return `${signer} will sign this ${action} on NEAR testnet, and the cost is a tiny 1 yoctoNEAR security deposit.`;
}

const TITLE: Record<WalletMethod, string> = {
  approve_share: "Sign this approval",
  decline_share: "Sign this decline",
  create_share: "Sign this share",
  revoke_share: "Sign this revoke",
  revoke_all_for_record: "Sign this revoke",
};

type Phase = "idle" | "pending" | "failed" | "signed";

function bytesFromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function loadStatus(): Promise<VisitorStatus> {
  const response = await fetch("/api/visitor", { credentials: "same-origin" });
  if (!response.ok) throw new Error("visitor status failed");
  return (await response.json()) as VisitorStatus;
}

function requestVisitorChallenge(): Promise<Response> {
  return fetch("/api/visitor/challenge", {
    method: "POST",
    credentials: "same-origin",
  });
}

export function WalletModal({
  method,
  onCancel,
  onSign,
  setupOnly = false,
  embedded = false,
}: {
  method: WalletMethod;
  onCancel: () => void;
  onSign: () => Promise<string | void> | string | void;
  setupOnly?: boolean;
  embedded?: boolean;
}) {
  const signRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState("");
  const [tx, setTx] = useState("");
  const [status, setStatus] = useState<VisitorStatus | null>(null);
  const [warning, setWarning] = useState("");

  useEffect(() => {
    signRef.current?.focus();
    loadStatus().then(setStatus).catch((error: unknown) => {
      setPhase("failed");
      setNote(error instanceof Error ? error.message : "visitor status failed");
    });
  }, []);

  useEffect(() => {
    if (embedded) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && phase !== "pending") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embedded, onCancel, phase]);

  async function refresh() {
    clearDemoConfigCache();
    setStatus(await loadStatus());
    pingVisitor();
  }

  async function tryInstantly() {
    setPhase("pending");
    setNote("");
    try {
      const record = createLocalDeviceKey();
      await browserKeyStore().save(record);
      const challengeResponse = await requestVisitorChallenge();
      const challenge = (await challengeResponse.json()) as { message?: string; recipient?: string; nonce?: string; error?: string };
      if (!challengeResponse.ok || !challenge.nonce || !challenge.message || !challenge.recipient) {
        throw new Error(challenge.error ?? "challenge failed");
      }
      const signature = signLocalNep413(record.secret, {
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: bytesFromBase64Url(challenge.nonce),
      });
      const started = await fetch("/api/visitor/start", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicKey: record.accountId, encPubkey: record.encPublicHex, signature }),
      });
      const body = (await started.json()) as { error?: string; txHash?: string; depositYocto?: string };
      if (!started.ok) throw new Error(body.error ?? "faucet transfer failed");
      clearDemoConfigCache();
      try {
        const registered = await registerDevicePatient(record, body.depositYocto ?? "10000000000000000000000");
        setTx(registered.hash || body.txHash || "");
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("ERR_ALREADY_REGISTERED")) throw error;
        setTx(body.txHash ?? "");
      }
      await refresh();
      markSetupDone();
      setPhase("idle");
      setNote("Demo key on this device is ready.");
    } catch (error) {
      setPhase("failed");
      setNote(error instanceof Error ? error.message : "sign failed");
    }
  }

  async function useWallet() {
    setPhase("pending");
    setNote("");
    try {
      const connected = await connectTestnetWallet();
      setWarning(connected.warning);
      if (connected.warning) throw new Error(connected.warning);
      const challengeResponse = await requestVisitorChallenge();
      const challenge = (await challengeResponse.json()) as { message?: string; recipient?: string; nonce?: string; error?: string };
      if (!challengeResponse.ok || !challenge.nonce || !challenge.message || !challenge.recipient) {
        throw new Error(challenge.error ?? "challenge failed");
      }
      const signed = await connected.signMessage({
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: bytesFromBase64Url(challenge.nonce),
      });
      const enc = createWalletEncKey(signed.accountId || connected.accountId);
      await browserKeyStore().save(enc);
      const bound = await fetch("/api/visitor/bind", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: signed.accountId || connected.accountId,
          publicKey: signed.publicKey,
          signature: signed.signature,
          encPubkey: enc.encPublicHex,
        }),
      });
      const body = (await bound.json()) as { error?: string; needsFunds?: boolean };
      if (!bound.ok) throw new Error(body.error ?? "signature rejected");
      clearDemoConfigCache();
      const contract = await fetch("/api/demo/config", { credentials: "same-origin" }).then((response) => response.json() as Promise<{ contractId?: string }>);
      if (contract.contractId) {
        try {
          const registered = await connected.signCall(contract.contractId, {
            accountId: enc.accountId,
            methodName: "self_register_patient",
            args: { enc_pubkey: enc.encPublicHex },
            deposit: BigInt("10000000000000000000000"),
          });
          setTx(registered.hash);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (!message.includes("ERR_ALREADY_REGISTERED")) {
            if (/method ?not ?found|MethodResolveError/i.test(message)) {
              throw new Error("This contract account did not accept self_register_patient. Use the demo server account to continue.");
            }
            throw error;
          }
        }
      }
      await refresh();
      markSetupDone();
      setPhase("idle");
      setNote(body.needsFunds ? "Wallet connected. This account still needs testnet NEAR." : "Wallet connected.");
    } catch (error) {
      setPhase("failed");
      setNote(error instanceof Error ? error.message : "sign failed");
    }
  }

  async function signOut() {
    setPhase("pending");
    try {
      await disconnectTestnetWallet();
      await browserKeyStore().clear();
      await fetch("/api/visitor/sign-out", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      clearDemoConfigCache();
      setWarning("");
      setTx("");
      await refresh();
      setPhase("idle");
      setNote("");
    } catch (error) {
      setPhase("failed");
      setNote(error instanceof Error ? error.message : "sign failed");
    }
  }

  async function sign() {
    setPhase("pending");
    setNote("");
    try {
      const signed = await onSign();
      setTx(typeof signed === "string" ? signed : "");
      setPhase("signed");
    } catch (error) {
      setPhase("failed");
      setNote(error instanceof Error ? error.message : "sign failed");
    }
  }

  const kind = status?.kind ?? "unbound";
  const demoSign = kind === "demo-server" && !setupOnly;
  const canSign = phase !== "pending" && (kind === "demo-server" || kind === "local-key" || kind === "near-connect") && !warning;

  const card = (
      <div
        role={embedded ? "region" : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-labelledby="wallet-title"
        className="w-full max-w-md rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <KeyRound size={18} aria-hidden="true" />
          <Pill tone="wired">{kind === "demo-server" ? "Demo server" : kind === "near-connect" ? "Wallet" : "This device"}</Pill>
        </div>
        <h2 id="wallet-title" className="mt-3 text-xl font-semibold">
          {setupOnly ? "Patient account" : TITLE[method]}
        </h2>
        {setupOnly && kind === "demo-server" ? null : (
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {setupOnly
              ? "Try instantly keeps a demo key on this device. Use my wallet signs with a testnet wallet. The server does not keep that key."
              : signCopy(method, kind)}
          </p>
        )}
        <p className="mt-3 text-sm leading-6">
          {status?.label || "Choose Try instantly or Use my wallet."}
          {status?.accountId ? <span className="mt-1 block break-all font-mono text-xs">{status.accountId}</span> : null}
        </p>
        {warning ? <p className="mt-2 text-sm">{warning}</p> : null}
        <div aria-live="polite" className="mt-2 text-sm">
          {phase === "pending" ? "Waiting for the signature." : null}
          {phase === "failed" ? note : null}
          {phase === "idle" && note ? note : null}
          {phase === "signed" ? "Signed on NEAR testnet." : null}
        </div>
        {tx ? (
          <a className="mt-2 block text-sm underline" href={txUrl(tx)} target="_blank" rel="noreferrer">
            View transaction
          </a>
        ) : null}
        {kind === "demo-server" ? null : (
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            No testnet NEAR yet?{" "}
            <a href={FAUCET_DOCS_URL} target="_blank" rel="noreferrer">
              Faucet
            </a>{" "}
            and{" "}
            <a href={FAUCET_SITE_URL} target="_blank" rel="noreferrer">
              near-faucet.io
            </a>
            .
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {status?.faucetConfigured && kind !== "local-key" && kind !== "near-connect" ? (
            <Button testId="try-instantly" disabled={phase === "pending"} onClick={tryInstantly}>
              Try instantly
            </Button>
          ) : null}
          {kind !== "near-connect" && !demoSign ? (
            <Button testId="use-wallet" disabled={phase === "pending"} onClick={useWallet}>
              Use my wallet
            </Button>
          ) : null}
          {setupOnly || phase === "signed" ? null : (
            <Button ref={signRef} tone="solid" testId="wallet-sign" guide={method === "approve_share" || method === "revoke_share" ? "sign" : undefined} disabled={!canSign} onClick={sign}>
              Sign
            </Button>
          )}
          {kind === "local-key" || kind === "near-connect" ? (
            <Button testId="wallet-sign-out" disabled={phase === "pending"} onClick={signOut}>
              Sign out
            </Button>
          ) : null}
          {embedded ? null : (
            <Button testId="wallet-cancel" disabled={phase === "pending"} onClick={onCancel}>
              {phase === "signed" ? "Done" : "Cancel"}
            </Button>
          )}
        </div>
      </div>
  );

  if (embedded) return card;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => phase !== "pending" && onCancel()}>
      {card}
    </div>
  );
}
