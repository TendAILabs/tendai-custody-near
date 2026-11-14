"use client";

import Link from "next/link";
import { menuFor, navBadge, type ClinicianOrg, type WorkspaceId } from "@/lib/nav/model";
import type { Story } from "@/lib/story";

export function NavList({
  pathname,
  hash,
  search,
  state,
  workspace,
  org,
  onNavigate,
}: {
  pathname: string;
  hash: string;
  search: string;
  state: Story;
  workspace: WorkspaceId | null;
  org: ClinicianOrg | null;
  guided?: boolean;
  onNavigate?: () => void;
}) {
  const groups = menuFor(workspace, org);
  return (
    <>
      {groups.map((group) => (
        <div key={group.label}>
          <h6>{group.label}</h6>
          {group.items.map((item) => {
            const on = item.test(pathname, hash, search);
            const badge = navBadge(item.id, state);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={on ? "c2-ri on" : "c2-ri"}
                style={{ ["--c" as string]: item.color }}
                aria-current={on ? "page" : undefined}
                title={item.hint}
                onClick={() => onNavigate?.()}
              >
                <i className="sw" />
                <span>{item.label}</span>
                <span className={badge?.tone ? `st ${badge.tone}` : "st"}>{badge?.text ?? ""}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}
