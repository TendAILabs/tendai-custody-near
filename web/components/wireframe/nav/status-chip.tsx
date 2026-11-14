"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { contractExplorerHref } from "@/lib/nav/model";
import { loadDemoConfig } from "@/lib/relay/flow";
import { ping, subscribe } from "./bus";

const RETIRED = "rr8573fee1";

export type ContractState = "loading" | "ready" | "missing";

function cachedContract(): string | null {
  const cached = sessionStorage.getItem("rr-contract-id");
  if (!cached || cached.includes(RETIRED)) return null;
  return cached;
}

export function useLiveContract(): { id: string | null; state: ContractState } {
  const cached = useSyncExternalStore((onStore) => subscribe("rr-contract", onStore), cachedContract, () => null);
  const [live, setLive] = useState<"loading" | "missing" | string>("loading");

  useEffect(() => {
    let cancel = false;
    loadDemoConfig()
      .then((config) => {
        if (cancel) return;
        const next = config.contractId?.trim() ?? "";
        if (!next || next.includes(RETIRED)) {
          sessionStorage.removeItem("rr-contract-id");
          ping("rr-contract");
          setLive("missing");
          return;
        }
        sessionStorage.setItem("rr-contract-id", next);
        ping("rr-contract");
        setLive(next);
      })
      .catch(() => {
        if (!cancel) setLive("missing");
      });
    return () => {
      cancel = true;
    };
  }, []);

  const fetched = live !== "loading" && live !== "missing" ? live : null;
  const id = fetched ?? cached;
  const state: ContractState = id ? "ready" : live === "loading" ? "loading" : "missing";
  return { id, state };
}

type NearState = "loading" | "reachable" | "down";
type TeeState = "loading" | "configured" | "missing";

export function StatusChip({ compact = false }: { compact?: boolean }) {
  const contract = useLiveContract();
  const [near, setNear] = useState<NearState>("loading");
  const [tee, setTee] = useState<TeeState>("loading");

  useEffect(() => {
    let cancel = false;
    fetch("/api/status")
      .then((response) => response.json() as Promise<{ near?: string; tee?: string }>)
      .then((body) => {
        if (cancel) return;
        setNear(body.near === "reachable" ? "reachable" : "down");
        setTee(body.tee === "configured" ? "configured" : "missing");
      })
      .catch(() => {
        if (cancel) return;
        setNear("down");
        setTee("missing");
      });
    return () => {
      cancel = true;
    };
  }, []);

  const nearText = near === "reachable" ? "up" : near === "down" ? "down" : "...";
  const teeText = tee === "configured" ? "ready" : tee === "missing" ? "missing" : "...";
  const title =
    near === "reachable"
      ? "NEAR testnet answered a status check."
      : near === "down"
        ? "NEAR testnet did not answer."
        : "Checking NEAR testnet.";

  return (
    <div className={compact ? "c2-status c2-status-compact" : "c2-status"} data-testid="status-chip" title={title}>
      <span>
        <span className="c2-dot" data-near={near} />
        NEAR {nearText}
      </span>
      <span className="c2-status-extra">TEE {teeText}</span>
      {contract.id ? (
        <a
          className="c2-status-extra"
          data-testid="testnet-badge"
          href={contractExplorerHref(contract.id)}
          target="_blank"
          rel="noreferrer"
          title="Open this contract on the testnet explorer"
        >
          {contract.id}
        </a>
      ) : (
        <span className="c2-status-extra" data-testid="testnet-badge">
          {contract.state === "loading" ? "Loading contract" : "Contract id unavailable"}
        </span>
      )}
    </div>
  );
}
