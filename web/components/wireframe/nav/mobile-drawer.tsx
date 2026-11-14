"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { ClinicianOrg, WorkspaceId } from "@/lib/nav/model";
import type { Story } from "@/lib/story";
import { NavList } from "./menu";
import { RoleTabs } from "./role-tabs";

export function MobileDrawer({
  open,
  pathname,
  hash,
  search,
  state,
  workspace,
  org,
  identity,
  onClose,
  onGuide,
  onReset,
}: {
  open: boolean;
  pathname: string;
  hash: string;
  search: string;
  state: Story;
  workspace: WorkspaceId | null;
  org: ClinicianOrg | null;
  identity: string | null;
  guided?: boolean;
  onClose: () => void;
  onGuide: () => void;
  onReset: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className="c2-drawer" data-open={open ? "true" : "false"} id="nav-drawer" role="dialog" aria-modal={open} aria-label="Menu" aria-hidden={open ? undefined : true}>
      <div className="c2-drawer-bar">
        <button ref={closeRef} type="button" className="c2-drawer-close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="c2-drawer-roles">
        <RoleTabs workspace={workspace} org={org} />
      </div>
      {identity ? <p className="c2-you">{identity}</p> : null}
      <nav aria-label="Workspace">
        <NavList pathname={pathname} hash={hash} search={search} state={state} workspace={workspace} org={org} onNavigate={onClose} />
      </nav>
      <div className="c2-case">
        <div className="c2-case-copy">
          <b>Fictional story</b>
          Example data on testnet.
        </div>
        <Link href="/settings" onClick={onClose}>
          Settings
        </Link>
        <Link href="/help" onClick={onClose}>
          FAQ
        </Link>
        <Link href="/glossary" onClick={onClose}>
          Glossary
        </Link>
        <button type="button" onClick={onGuide}>
          Guided demo
        </button>
        <button type="button" onClick={onReset}>
          Reset story
        </button>
      </div>
    </div>
  );
}
