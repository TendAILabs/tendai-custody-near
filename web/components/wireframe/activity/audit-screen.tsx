"use client";

import { useEffect, useState } from "react";
import { describeActor, formatEventTime, shareKindLabel, statusLabel, stillHasAccess } from "@/lib/near/activity";
import { loadActors, loadRecord, type ChainActor, type ChainShareFull } from "@/lib/near/custody";
import { accountUrl } from "@/lib/near/explorer";
import { loadDemoConfig } from "@/lib/relay/flow";
import { useClientMounted } from "@/lib/client-mounted";
import { useStory } from "@/lib/story-context";
import { Btn, PageHead, Section, Tag } from "../c2";
import { WhatYouCanVerify } from "./verify-panel";

function fingerprint(hex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return "No public encryption key stored";
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
}

function when(atNs: string | null, mounted: boolean): string {
  if (!atNs) return "No end date on the contract";
  if (!mounted) return "Local time after load";
  const parts = formatEventTime(atNs);
  return `${parts.date} ${parts.time} ${parts.zone}`;
}

export function AuditScreen() {
  const { state } = useStory();
  const [actors, setActors] = useState<ChainActor[]>([]);
  const [shares, setShares] = useState<ChainShareFull[]>([]);
  const [contractId, setContractId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const mounted = useClientMounted();

  useEffect(() => {
    let cancel = false;
    queueMicrotask(() => {
      if (!cancel) setLoading(true);
    });
    loadDemoConfig()
      .then(async (config) => {
        const [directory, record] = await Promise.all([
          loadActors(config.contractId),
          state.recordId ? loadRecord(config.contractId, state.recordId) : Promise.resolve({ events: [], shares: [] }),
        ]);
        if (cancel) return;
        setContractId(config.contractId);
        setActors(directory);
        setShares(record.shares);
        setError("");
      })
      .catch((cause: unknown) => {
        if (!cancel) setError(cause instanceof Error ? cause.message : "The contract could not be read. Try again in a moment.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [state.recordId, state.consentTx, state.revokeTx, state.secondTx, state.deidTx, state.hospitalOpenTx]);

  const openShares = stillHasAccess(shares);
  const contractHref = contractId ? accountUrl(contractId) : "";

  return (
    <div data-testid="audit-page">
      <PageHead
        eyebrow="Admin"
        title="Who can still open"
        mark="records"
        what="This is a read-only review of live shares and registered organizations."
        can="You can see each holder, the end date, and the open count. It is designed around HIPAA principles, and it is not a certification."
        state={state}
      />
      <p className="c2-lede">
        Fictional data. Testnet only. Revoke cannot erase a copy already downloaded. The clinic that created the chart still holds its own copy, and that copy is not a share on this list.
        {contractHref ? (
          <>
            {" "}
            <a href={contractHref} target="_blank" rel="noreferrer">
              Contract on the testnet explorer
            </a>
          </>
        ) : null}
      </p>
      {error ? <p className="c2-note bad">{error}</p> : null}
      {loading ? <p className="c2-lede">Reading the contract.</p> : null}
      <Section index="01" title="Who still has access" aside={state.recordId ? `Record ${state.recordId}` : "No chart in this session"}>
        <div data-testid="audit-access-review">
          {!state.recordId ? (
            <p>Send a referral in this session before this review has shares to list. The directory below is everyone registered on the contract. That directory is public, and it does not include chart text.</p>
          ) : openShares.length === 0 ? (
            <p>No share on this chart can be opened through TendAI Custody right now.</p>
          ) : (
            <ul>
              {openShares.map((share) => {
                const holder = describeActor(share.to, actors, null);
                const opens = share.open_count === 1 ? "1 time" : `${share.open_count} times`;
                return (
                  <li key={share.id}>
                    {holder.name} ({holder.role}) can still open the {shareKindLabel(share.kind).toLowerCase()}. Ends {when(share.expires_at_ns, mounted)}. Opened {opens}.
                    {share.read_only ? " Read only." : ""}
                  </li>
                );
              })}
            </ul>
          )}
          <p>A revoked or expired share is not in this list. A reply note is not treated as access to the chart.</p>
        </div>
      </Section>
      <Section index="02" title="Shares on this chart" aside="Status, end date, opens">
        {!state.recordId || shares.length === 0 ? (
          <p>No shares for this session yet.</p>
        ) : (
          <div data-testid="audit-shares">
            <div className="c2-hh">
              <span>Holder</span>
              <span>Kind</span>
              <span>Status</span>
              <span>Ends</span>
              <span>Opens</span>
              <span />
            </div>
            {shares.map((share) => {
              const holder = describeActor(share.to, actors, null);
              return (
                <div key={share.id} className={share.effective_status === "Revoked" ? "c2-hold rev" : "c2-hold"}>
                  <div className="who">
                    <b>{holder.name}</b>
                    <span>{holder.role}</span>
                  </div>
                  <div className="scope">{shareKindLabel(share.kind)}</div>
                  <div className="m">{statusLabel(share.effective_status)}</div>
                  <div className="m">{when(share.expires_at_ns, mounted)}</div>
                  <div className="m">{share.open_count === 0 ? "Not opened" : share.open_count}</div>
                  <Tag tone={share.effective_status === "Active" ? "ok" : share.effective_status === "Revoked" ? "bad" : "qmut"}>
                    {share.effective_status || "Unknown"}
                  </Tag>
                </div>
              );
            })}
          </div>
        )}
        {shares.length === 50 ? <p>Showing the first 50 shares.</p> : null}
      </Section>
      <Section index="03" title="Who is registered" aside="Actor directory">
        <p>These accounts are registered on the contract. A hospital is stored with the clinic role. The display name is what distinguishes it. The short code is the public encryption key, not a secret.</p>
        <div data-testid="audit-actors" style={{ overflowX: "auto" }}>
          <table className="c2-tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Account</th>
                <th>Status</th>
                <th>Public key</th>
              </tr>
            </thead>
            <tbody>
              {actors.map((actor) => {
                const described = describeActor(actor.account_id, actors, null);
                return (
                  <tr key={actor.account_id}>
                    <td className="nm">{described.name || actor.display_name}</td>
                    <td className="m">{described.role}</td>
                    <td className="m">
                      <a href={accountUrl(actor.account_id)} target="_blank" rel="noreferrer">
                        {actor.account_id}
                      </a>
                    </td>
                    <td className="m">{actor.active ? "Active" : "Inactive"}</td>
                    <td className="m">{fingerprint(actor.enc_pubkey)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {actors.length === 0 && !loading ? <p>The directory is empty, or it has not loaded.</p> : null}
        {actors.length === 50 ? <p>Showing the first 50 accounts.</p> : null}
      </Section>
      <div className="c2-row" style={{ marginTop: 8 }}>
        <Btn href="/patient/timeline">Open the activity log</Btn>
        <Btn href="/patient/sharing" tone="ghost">
          Open access
        </Btn>
      </div>
      <WhatYouCanVerify />
    </div>
  );
}
