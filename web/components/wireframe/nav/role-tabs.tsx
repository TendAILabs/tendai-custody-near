"use client";

import Link from "next/link";
import { CLINICIAN_ORGS, WORKSPACES, type ClinicianOrg, type WorkspaceId } from "@/lib/nav/model";

export function RoleTabs({ workspace, org }: { workspace: WorkspaceId | null; org: ClinicianOrg | null }) {
  return (
    <div className="c2-roles" role="tablist" aria-label="Who you are">
      {WORKSPACES.map((item) => {
        const on = item.id === workspace;
        const href = item.id === "clinician" ? (CLINICIAN_ORGS.find((entry) => entry.id === (org ?? "clinic"))?.href ?? item.href) : item.href;
        return (
          <Link key={item.id} href={href} role="tab" aria-selected={on} className={on ? "on" : undefined} data-testid={`role-tab-${item.id}`}>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
