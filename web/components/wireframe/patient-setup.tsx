"use client";

import { useState } from "react";
import { markSetupDone, pingVisitor, useAccountReady } from "@/lib/visitor/use-account";
import { WalletModal } from "./wallet-modal";

async function confirmDemoAccount(): Promise<string> {
  const response = await fetch("/api/visitor/demo", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    return "The demo server account could not start a session. Try that button again.";
  }
  markSetupDone();
  pingVisitor();
  return "";
}

export function PatientSetup() {
  const account = useAccountReady();
  const [note, setNote] = useState("");
  if (!account.loaded) {
    return <p className="c2-lede">Checking this browser for a patient account.</p>;
  }
  if (account.setupDone) {
    return (
      <p className="c2-lede" data-testid="patient-account-ready">
        {account.kind === "demo-server"
          ? "Maya confirmed the shared demo account for this browser. Her signature is what lets the hospital open a share."
          : `Maya's account is ready on this browser${account.accountId ? ` (${account.accountId})` : ""}, and her signature is what lets the hospital open a share.`}
      </p>
    );
  }
  if (account.kind === "demo-server") {
    return (
      <div data-testid="patient-account-setup">
        <p className="c2-lede">
          The demo server account is the easy option, and your own wallet needs a contract upgrade that is not on testnet yet.
        </p>
        <button
          type="button"
          className="c2-btn"
          data-testid="use-demo-account"
          data-guide="setup"
          onClick={() => {
            setNote("");
            void confirmDemoAccount().then(setNote);
          }}
        >
          Use the demo server account
        </button>
        {note ? <p className="c2-note bad">{note}</p> : null}
        <WalletModal
          embedded
          setupOnly
          method="approve_share"
          onCancel={() => undefined}
          onSign={async () => {
            throw new Error("Set up the account before signing a share.");
          }}
        />
      </div>
    );
  }
  if (account.kind === "local-key" || account.kind === "near-connect") {
    return (
      <div data-testid="patient-account-setup">
        <p className="c2-lede">This browser already has a testnet account. Continue with it to finish this step.</p>
        <button type="button" className="c2-btn" data-testid="continue-account" data-guide="setup" onClick={markSetupDone}>
          Continue with this account
        </button>
      </div>
    );
  }
  return (
    <div data-testid="patient-account-setup">
      <p className="c2-lede">
        Press Use the demo server account to play Maya in this story, or choose Try instantly or Use my wallet if you want a testnet account of your own.
      </p>
      <button
        type="button"
        className="c2-btn"
        data-testid="use-demo-account"
        data-guide="setup"
        onClick={() => {
          setNote("");
          void confirmDemoAccount().then(setNote);
        }}
      >
        Use the demo server account
      </button>
      {note ? <p className="c2-note bad">{note}</p> : null}
      <WalletModal
        embedded
        setupOnly
        method="approve_share"
        onCancel={() => undefined}
        onSign={async () => {
          throw new Error("Set up the account before signing a share.");
        }}
      />
    </div>
  );
}
