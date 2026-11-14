"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Arrow, Btn, PageHead, Section, Tag } from "@/components/wireframe/c2";
import { explainError } from "@/lib/copy/errors";
import { useStory } from "@/lib/story-context";

type NearCheck = "reachable" | "down" | "checking";
type TeeCheck = "configured" | "missing" | "checking";

function explorerHref(accountId: string): string | null {
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(accountId)) return null;
  return `https://testnet.nearblocks.io/address/${accountId}`;
}

export default function SupportPage() {
  const { state } = useStory();
  const [kept, setKept] = useState(false);
  const [near, setNear] = useState<NearCheck>("checking");
  const [tee, setTee] = useState<TeeCheck>("checking");
  const [contractId, setContractId] = useState("");
  const [contractNote, setContractNote] = useState("Reading the contract id for this host.");
  const [statusNote, setStatusNote] = useState("");

  useEffect(() => {
    let cancel = false;
    fetch("/api/status")
      .then(async (response) => {
        if (response.status === 429) {
          if (!cancel) {
            const explained = explainError(response.status);
            setNear("down");
            setTee("missing");
            setStatusNote(`${explained.sentence} ${explained.next}`);
          }
          return null;
        }
        if (!response.ok) throw new Error("status failed");
        return response.json() as Promise<{ near?: NearCheck; tee?: TeeCheck }>;
      })
      .then((body) => {
        if (cancel || !body) return;
        setNear(body.near === "reachable" ? "reachable" : "down");
        setTee(body.tee === "configured" ? "configured" : "missing");
      })
      .catch(() => {
        if (cancel) return;
        setNear("down");
        setTee("missing");
      });
    fetch("/api/demo/config", { credentials: "same-origin" })
      .then(async (response) => {
        if (cancel) return;
        if (response.status === 429) {
          const explained = explainError({ status: response.status, error: "rate limit" });
          setContractNote(`${explained.sentence} ${explained.next}`);
          return;
        }
        if (!response.ok) {
          setContractNote("The contract id is not available from this host yet. Reload this page.");
          return;
        }
        const body = (await response.json()) as { contractId?: string };
        if (!body.contractId) {
          setContractNote("The contract id is not available from this host yet. Reload this page.");
          return;
        }
        setContractId(body.contractId);
        setContractNote("");
      })
      .catch(() => {
        if (cancel) return;
        setContractNote("The contract id is not available from this host yet. Reload this page.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  function keep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setKept(true);
  }

  const explorer = contractId ? explorerHref(contractId) : null;

  if (kept) {
    return (
      <div data-testid="support-page">
        <PageHead
          index="10"
          eyebrow="Support · Local only"
          title="Nothing was"
          mark="sent"
          lede="This form is local. Nothing is sent, stored, or emailed."
          state={state}
        />
        <div className="c2-navy c2-sent" data-testid="support-sent">
          <div className="c2-lab">Local confirmation</div>
          <h2>Nothing was sent.</h2>
          <p>Your words stayed in this browser for this moment and were not stored. There is no message, no ticket, and no inbox on the other side.</p>
          <div className="c2-row">
            <button type="button" className="c2-btn" style={{ background: "#F4F6F8", color: "var(--ink)", borderColor: "#F4F6F8" }} onClick={() => setKept(false)}>
              Write another note <Arrow />
            </button>
            <Link href="/help" style={{ color: "#f4f6f8", textDecoration: "underline", textDecorationColor: "var(--sig)" }}>
              Back to Help
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="support-page">
      <PageHead
        eyebrow="Help"
        title="Report a"
        mark="problem"
        what="This page keeps a note in this browser."
        can="You can write a reminder for yourself. Nothing is emailed, and you should not type a real patient record."
        state={state}
      />
      <div className="c2-cols" style={{ marginTop: 8 }}>
        <Section index="A" title="Local note" aside="Nothing is sent">
          <form className="c2-form" onSubmit={keep} data-testid="support-local">
            <p className="hint">This form is local. Nothing is sent to a server, an inbox, or an issue tracker.</p>
            <label>
              Your name
              <input name="name" defaultValue="Maya Okafor" autoComplete="off" />
            </label>
            <label>
              Email
              <input name="email" type="email" defaultValue="maya@example.com" autoComplete="off" />
            </label>
            <label>
              I am
              <select name="role" defaultValue="A patient">
                <option>A patient</option>
                <option>A clinician</option>
                <option>An admin</option>
                <option>A judge or developer</option>
                <option>Someone looking around</option>
              </select>
            </label>
            <label>
              Note
              <textarea name="message" placeholder="What should you remember? This stays on this page." />
            </label>
            <span className="hint">Do not include real patient information. This story is fictional.</span>
            <div className="c2-row">
              <Btn type="submit">
                Keep note on this page <Arrow />
              </Btn>
              <Btn tone="ghost" type="button" onClick={() => setKept(true)}>
                Note a problem here
              </Btn>
            </div>
          </form>
        </Section>
        <div>
          <Section index="B" title="Service status" aside="From this host">
            <div className="c2-srow" data-testid="support-status">
              <i className="sw" style={{ background: near === "reachable" ? "var(--sig)" : near === "down" ? "var(--red)" : "var(--line)" }} />
              <div>
                <b>NEAR testnet</b>
                <p>{statusNote || (near === "down" ? "The testnet RPC did not answer just now. Reload this page." : "Practice network. This check asks whether the testnet RPC answers.")}</p>
              </div>
              <Tag tone={near === "reachable" ? "q" : near === "down" ? "qbad" : "qmut"}>{near === "checking" ? "Checking" : near === "reachable" ? "Reachable" : "Down"}</Tag>
            </div>
            <div className="c2-srow">
              <i className="sw" style={{ background: tee === "configured" ? "var(--sig)" : tee === "missing" ? "var(--red)" : "var(--line)" }} />
              <div>
                <b>NEAR AI Cloud</b>
                <p>Sealed summaries, signed provider_tee. This check only looks for a configured key.</p>
              </div>
              <Tag tone={tee === "configured" ? "q" : tee === "missing" ? "qbad" : "qmut"}>{tee === "checking" ? "Checking" : tee === "configured" ? "Configured" : "Not configured"}</Tag>
            </div>
            <div className="c2-srow">
              <i className="sw" style={{ background: explorer ? "var(--sig)" : "var(--line)" }} />
              <div>
                <b>Contract</b>
                {explorer ? (
                  <p>
                    {contractId}.{" "}
                    <a href={explorer} target="_blank" rel="noreferrer" data-testid="contract-explorer">
                      View on the testnet explorer
                    </a>
                  </p>
                ) : (
                  <p>{contractNote}</p>
                )}
              </div>
              <Tag tone={explorer ? "q" : "qmut"}>{explorer ? "Testnet" : "Waiting"}</Tag>
            </div>
          </Section>
          <Section index="C" title="Read next">
            <div className="c2-links">
              <Link href="/start">
                Start here <Arrow />
              </Link>
              <Link href="/glossary">
                Glossary <Arrow />
              </Link>
              <Link href="/help">
                Help and FAQ <Arrow />
              </Link>
              <Link href="/privacy">
                Privacy notice <Arrow />
              </Link>
              <Link href="/terms">
                Terms of use <Arrow />
              </Link>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
