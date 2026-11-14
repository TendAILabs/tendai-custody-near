"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ORG } from "@/lib/fixtures";
import { useStory } from "@/lib/story-context";
import { PageHead, Tag } from "./c2";

export function BlockedScreen({ titleAs: _titleAs = "h1" }: { titleAs?: "h1" | "h2" }) {
  const { state, markBlocked } = useStory();

  useEffect(() => {
    if (state.revoked.referral) markBlocked();
  }, [markBlocked, state.revoked.referral]);

  return (
    <div>
      <PageHead
        index="03"
        eyebrow={`${ORG.hospital} · blocked`}
        title={state.revoked.referral ? "Access revoked." : "Not blocked yet."}
        second={state.revoked.referral ? <mark className="c2-mark red">Next open blocked.</mark> : undefined}
        lede={
          state.revoked.referral
            ? "St. Aster Hospital asked to open the share again. The contract refuses. Revoking cannot erase a copy someone already saved."
            : "Revoke the St. Aster share from Access, then open it here."
        }
        state={state}
        bad={state.revoked.referral}
      />
      {state.revoked.referral ? (
        <div className="c2-navy c2-term" data-testid="blocked-reason" style={{ marginTop: 26 }}>
          <Tag tone="bad">Revoked</Tag>
          <div style={{ marginTop: 12 }}>
            request_open <span className="no">ERR_REVOKED</span>
            {state.revokeTx ? (
              <>
                <br />
                tx {state.revokeTx}
              </>
            ) : null}
            {state.blockedAttempt ? (
              <>
                <br />
                <span className="dim">attempt recorded in this session</span>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="c2-lede">
          <Link href="/patient/sharing">Access</Link>
        </p>
      )}
      <p className="c2-lede">
        <Link href="/hospital">Back to St. Aster Hospital</Link>
      </p>
    </div>
  );
}
