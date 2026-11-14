"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GUIDE_EXTRAS, guideComplete } from "@/lib/guide";
import { useAccountReady } from "@/lib/visitor/use-account";
import { activityCsv, activityJson, buildActivity, filterRows, formatEventTime, holderChoices, kindChoices, type TxBook } from "@/lib/near/activity";
import { loadActors, loadRecord, type ChainActor, type ChainEvent, type ChainShareFull } from "@/lib/near/custody";
import { loadDemoConfig, type DemoConfig } from "@/lib/relay/flow";
import { phiHits } from "@/lib/story";
import { useClientMounted } from "@/lib/client-mounted";
import { useStory } from "@/lib/story-context";
import { ContractPanel } from "./contract-panel";
import { ReferenceRun } from "./reference-run";
import { Btn, PageHead, Tag } from "../c2";

function subscribeClient() {
  return () => {};
}

function readTimeZone(): string {
  return formatEventTime((BigInt(Date.now()) * BigInt(1_000_000)).toString()).zone;
}

function emptyTimeZone(): string {
  return "";
}

function saveFile(name: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function bookFrom(state: ReturnType<typeof useStory>["state"]): TxBook {
  return {
    referralTx: state.referralTx,
    consentTx: state.consentTx,
    hospitalOpenTx: state.hospitalOpenTx,
    consultTx: state.consultTx,
    secondTx: state.secondTx,
    secondReplyTx: state.secondReplyTx,
    deidTx: state.deidTx,
    revokeTx: state.revokeTx,
    recordTx: state.recordTx,
    shareId: state.shareId,
    secondShareId: state.secondShareId,
    deidShareId: state.deidShareId,
  };
}

export function ActivityLog() {
  const { state, ready, markProof } = useStory();
  const pathname = usePathname();
  const account = useAccountReady();
  const patientLog = pathname.startsWith("/patient");
  const finished = guideComplete(state, account.setupDone);
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [shares, setShares] = useState<ChainShareFull[]>([]);
  const [actors, setActors] = useState<ChainActor[]>([]);
  const [contractId, setContractId] = useState("");
  const [accounts, setAccounts] = useState<DemoConfig["accounts"] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [holder, setHolder] = useState("all");
  const [kind, setKind] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [showChain, setShowChain] = useState(false);
  const mounted = useClientMounted();
  const zone = useSyncExternalStore(subscribeClient, readTimeZone, emptyTimeZone);

  useEffect(() => {
    if (!ready) return;
    markProof();
  }, [ready, markProof]);

  useEffect(() => {
    const recordId = state.recordId;
    if (!recordId) return;
    let cancel = false;
    queueMicrotask(() => {
      if (!cancel) setLoading(true);
    });
    loadDemoConfig()
      .then(async (config) => {
        const [directory, record] = await Promise.all([loadActors(config.contractId), loadRecord(config.contractId, recordId)]);
        if (cancel) return;
        setContractId(config.contractId);
        setAccounts(config.accounts);
        setActors(directory);
        setEvents(record.events);
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
  }, [state.recordId, state.consentTx, state.hospitalOpenTx, state.consultTx, state.secondTx, state.deidTx, state.revokeTx, state.secondReplyTx, state.referralTx]);

  const rows = useMemo(
    () =>
      buildActivity(events, shares, actors, bookFrom(state), contractId, {
        formatTime: mounted,
        accounts,
      }),
    [events, shares, actors, state, contractId, mounted, accounts],
  );
  const shown = filterRows(rows, holder, kind);
  const holders = holderChoices(rows);
  const kinds = kindChoices(rows);
  const chainRaw = JSON.stringify({ events, shares }, null, 2);
  const hits = phiHits({ events, shares });

  return (
    <div data-testid="activity-log">
      <PageHead
        eyebrow={patientLog ? "Patient" : "Activity log"}
        title={patientLog ? "Everything that happened to your" : "Full custody log on"}
        mark={patientLog ? "records" : "NEAR"}
        what={
          patientLog
            ? "This is Maya's own log of what happened to her records."
            : "This is the full custody log for the chart in this session."
        }
        can={
          patientLog
            ? "You can read each send, approval, open, and revoke, and open the matching NEAR testnet record."
            : "You can filter the events, export them as CSV or JSON, and open each one on NEAR testnet."
        }
        state={state}
      />
      {finished ? (
        <section className="c2-sec" data-testid="finish-card">
          <div className="c2-sec-h">
            <span className="t">
              <em>You did the whole flow. Here is the proof.</em>
            </span>
          </div>
          <div className="c2-sec-b">
            <p>
              The revoke transaction is on this log. The later open was refused by the contract check, and that refusal was not written as a new transaction. St. Aster Hospital cannot open the share again from here.
            </p>
            <p className="c2-lede">
              <Link href="/onchain?desk=proof">Activity log</Link>
              {" · "}
              <Link href="/audit">Access review</Link>
              {" · "}
              <Link href="/verification">AI check</Link>
            </p>
            <p className="c2-lede">You can keep going with these extras.</p>
            <ul>
              {GUIDE_EXTRAS.map((extra) => (
                <li key={extra.href}>
                  <Link href={extra.href}>{extra.label}</Link>. {extra.note}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
      {!patientLog ? (
        <>
          <ContractPanel />
          <ReferenceRun />
        </>
      ) : null}
      <p className="c2-lede">
        A transaction link opens that call on the testnet explorer. If this session did not save a transaction hash, the link opens the account instead. The older history address opens this page. <Link href="/audit">Open the compliance page</Link> to see who can still open a share.
      </p>
      <div className="c2-row" style={{ marginTop: 16, flexWrap: "wrap", gap: 12 }}>
        <details>
          <summary>Details</summary>
          <Tag testId="phi-count" tone={hits.length === 0 ? "ok" : "bad"}>
            Example names in this contract read: {hits.length}
          </Tag>
        </details>
        <span className="mono" style={{ fontSize: 12, color: "var(--faint)" }}>
          {contractId ? `Contract ${contractId}` : "Contract not loaded"} · {events.length} events
          {events.length === 50 ? " (first 50)" : ""}
        </span>
      </div>
      <p className="c2-lede" data-testid="activity-zone">
        {mounted && zone ? `Times are in your time zone (${zone}).` : "Times appear in your time zone once this page has loaded."} This count searches the contract read for the example names and chart words used in the demo. It is not a full privacy review.
      </p>
      {error ? <p className="c2-note bad">{error}</p> : null}
      {!state.recordId ? (
        <div className="c2-empty">
          <div className="c2-lab ink">Activity</div>
          <h2>No chart from this visit yet.</h2>
          <p>This browser has not saved a record id. The log fills in after Riverbend Family Clinic sends the referral.</p>
          <div className="c2-row">
            <Btn href="/clinic" guide="proof">Go to Riverbend Family Clinic</Btn>
          </div>
        </div>
      ) : (
        <>
          <div className="c2-row" style={{ marginTop: 8, flexWrap: "wrap", gap: 16, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6, minWidth: 180, flex: "1 1 200px" }}>
              <span className="c2-lab ink">Holder</span>
              <select
                className="c2-field"
                data-testid="activity-filter-holder"
                data-guide="proof"
                value={holder}
                onChange={(event) => setHolder(event.target.value)}
              >
                <option value="all">All holders</option>
                {holders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6, minWidth: 180, flex: "1 1 200px" }}>
              <span className="c2-lab ink">Kind</span>
              <select className="c2-field" data-testid="activity-filter-kind" value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="all">All kinds</option>
                {kinds.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <Btn small tone="ghost" testId="activity-export-csv" onClick={() => saveFile("tendai-activity.csv", activityCsv(shown), "text/csv")}>
              Export CSV
            </Btn>
            <Btn small tone="ghost" testId="activity-export-json" onClick={() => saveFile("tendai-activity.json", activityJson(shown), "application/json")}>
              Export JSON
            </Btn>
          </div>
          <p className="c2-lede" aria-live="polite">
            {loading ? "Reading the contract." : `${shown.length} of ${rows.length} events in this filter. Export uses this filter.`}
          </p>
          <div className="c2-log-plain" data-testid="history-list">
            {shown.map((row) => {
              const shownRaw = open === row.id;
              return (
                <article key={row.id} className={shownRaw ? "c2-lrow open" : "c2-lrow"}>
                  <div className="c2-lsum">
                    <span className="when">
                      {row.time || "..."}
                      <span>
                        {row.date} {row.zone}
                      </span>
                    </span>
                    <span className="node" style={{ ["--c" as string]: row.color }} />
                    <span className="who">
                      <h3>{row.sentence}</h3>
                      <p>
                        {row.role}. {row.detail}
                      </p>
                      <p>
                        <a href={row.explorer.href} target="_blank" rel="noreferrer">
                          {row.explorer.label}
                        </a>
                        {row.explorer.kind === "tx" ? null : " No transaction hash was saved for this event."}
                      </p>
                    </span>
                    <button
                      type="button"
                      className="rawlab"
                      aria-expanded={shownRaw}
                      onClick={() => setOpen(shownRaw ? null : row.id)}
                      style={{ border: 0, background: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                    >
                      {shownRaw ? "Hide raw" : "Raw JSON"}
                    </button>
                  </div>
                  {shownRaw ? <pre className="raw">{JSON.stringify(row.raw, null, 2)}</pre> : null}
                </article>
              );
            })}
          </div>
          {shown.length === 0 && !loading ? <p className="c2-lede">Nothing in this filter yet.</p> : null}
          <div className="c2-row" style={{ marginTop: 16 }}>
            <Btn small tone="ghost" onClick={() => setShowChain((value) => !value)}>
              {showChain ? "Hide the contract read" : "Show the contract read"}
            </Btn>
          </div>
          {showChain ? (
            <pre
              data-testid="chain-json"
              className="c2-panel mono"
              style={{ marginTop: 12, padding: 16, maxHeight: "28rem", overflow: "auto", fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-all" }}
            >
              {chainRaw}
            </pre>
          ) : (
            <pre data-testid="chain-json" hidden>
              {chainRaw}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
