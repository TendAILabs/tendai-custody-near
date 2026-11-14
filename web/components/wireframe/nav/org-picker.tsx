"use client";

import { useRouter } from "next/navigation";
import { CLINICIAN_ORGS, type ClinicianOrg } from "@/lib/nav/model";

export function OrgPicker({ org }: { org: ClinicianOrg }) {
  const router = useRouter();
  return (
    <div className="c2-org-bar">
      <label className="c2-org-wrap" htmlFor="clinician-org">
        <span className="c2-org-label">Organization</span>
        <select
          id="clinician-org"
          className="c2-org"
          data-testid="org-picker"
          value={org}
          onChange={(event) => {
            const next = CLINICIAN_ORGS.find((entry) => entry.id === event.target.value);
            if (next) router.push(next.href);
          }}
        >
          {CLINICIAN_ORGS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
