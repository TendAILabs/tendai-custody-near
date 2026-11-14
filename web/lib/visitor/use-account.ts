"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { VisitorStatus } from "./status";

const SETUP_KEY = "rr-setup-done";

export type AccountView = {
  loaded: boolean;
  ready: boolean;
  setupDone: boolean;
  kind: VisitorStatus["kind"] | "";
  accountId: string;
  label: string;
};

const EMPTY: AccountView = { loaded: false, ready: false, setupDone: false, kind: "", accountId: "", label: "" };

export function markSetupDone(): void {
  sessionStorage.setItem(SETUP_KEY, "1");
  window.dispatchEvent(new Event("rr-visitor"));
}

export function clearSetup(): void {
  sessionStorage.removeItem(SETUP_KEY);
  window.dispatchEvent(new Event("rr-visitor"));
}

function readSetupDone(): boolean {
  return sessionStorage.getItem(SETUP_KEY) === "1";
}

export function accountReadyKind(kind: VisitorStatus["kind"] | ""): boolean {
  return kind === "local-key" || kind === "near-connect" || kind === "demo-server";
}

export function useAccountReady(): AccountView {
  const [view, setView] = useState<AccountView>(EMPTY);
  const setupDone = useSyncExternalStore(
    (onStore) => {
      window.addEventListener("rr-visitor", onStore);
      return () => window.removeEventListener("rr-visitor", onStore);
    },
    readSetupDone,
    () => false,
  );

  useEffect(() => {
    let cancel = false;
    const load = () => {
      fetch("/api/visitor", { credentials: "same-origin" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: VisitorStatus | null) => {
          if (cancel) return;
          if (!body?.kind) {
            setView({ loaded: true, ready: false, setupDone, kind: "", accountId: "", label: "" });
            return;
          }
          setView({
            loaded: true,
            ready: accountReadyKind(body.kind),
            setupDone,
            kind: body.kind,
            accountId: body.accountId,
            label: body.label,
          });
        })
        .catch(() => {
          if (!cancel) setView({ loaded: true, ready: false, setupDone, kind: "", accountId: "", label: "" });
        });
    };
    load();
    window.addEventListener("rr-visitor", load);
    return () => {
      cancel = true;
      window.removeEventListener("rr-visitor", load);
    };
  }, [setupDone]);

  return { ...view, setupDone };
}

export function pingVisitor(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("rr-visitor"));
}
