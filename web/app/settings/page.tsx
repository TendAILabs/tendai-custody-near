"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHead } from "@/components/wireframe/c2";
import { useLiveContract } from "@/components/wireframe/nav/status-chip";
import { contractExplorerHref } from "@/lib/nav/model";
import { STORAGE_KEY } from "@/lib/story";
import { useStory } from "@/lib/story-context";

const LOCAL_KEYS = ["rr-intro-seen", "rr-guided", "rr-notes-seen", "rr-view-as"];

export default function SettingsPage() {
  const router = useRouter();
  const { state, reset } = useStory();
  const contract = useLiveContract();
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState("");

  return (
    <div>
      <PageHead
        eyebrow="Admin"
        title="Demo settings for this"
        mark="browser"
        what="These settings apply only in this browser."
        can="You can read the network and the contract, reset the demo, and clear local data."
        state={state}
      />
      <section className="c2-sec">
        <div className="c2-sec-h">
          <span className="t">
            A <em>Network</em>
          </span>
          <span className="r">Testnet now</span>
        </div>
        <div className="c2-plain">
          <p>This demo runs on NEAR testnet. Mainnet is planned. On mainnet, each clinic would hold its own signer and each patient would approve with their own wallet.</p>
          <fieldset className="c2-net">
            <legend>Network</legend>
            <label>
              <input type="radio" name="network" value="testnet" checked onChange={() => undefined} />
              Testnet. This demo runs here.
            </label>
            <label>
              <input type="radio" name="network" value="mainnet" disabled />
              Mainnet. Planned.
            </label>
          </fieldset>
        </div>
      </section>
      <section className="c2-sec">
        <div className="c2-sec-h">
          <span className="t">
            B <em>Contract</em>
          </span>
        </div>
        <div className="c2-plain">
          <p>The contract id is read from the live demo config. This page does not keep a fixed address in the source.</p>
          {contract.id ? (
            <p>
              <a href={contractExplorerHref(contract.id)} target="_blank" rel="noreferrer">
                {contract.id}
              </a>{" "}
              on the testnet explorer.
            </p>
          ) : (
            <p>{contract.state === "loading" ? "Loading the contract id." : "This server has not published a contract id."}</p>
          )}
        </div>
      </section>
      <section className="c2-sec">
        <div className="c2-sec-h">
          <span className="t">
            C <em>Demo data</em>
          </span>
        </div>
        <div className="c2-plain">
          <p>Reset puts the fictional story in this browser back to the start. Records already written on testnet stay on testnet.</p>
          <button
            type="button"
            className="c2-btn sm"
            onClick={() => {
              reset();
              setArmed(false);
              setNote("Story reset in this browser.");
            }}
          >
            Reset demo
          </button>
          <p>Clear local data also forgets the guided demo choice and which notifications you have opened. It does not delete anything on NEAR.</p>
          <button
            type="button"
            className="c2-btn sm danger"
            onClick={() => {
              if (!armed) {
                setArmed(true);
                setNote("Click again to clear this browser.");
                return;
              }
              for (const key of LOCAL_KEYS) localStorage.removeItem(key);
              sessionStorage.removeItem("rr-contract-id");
              sessionStorage.removeItem(STORAGE_KEY);
              window.dispatchEvent(new Event("rr-local"));
              reset();
              router.push("/home");
            }}
          >
            {armed ? "Clear local data now" : "Clear local data"}
          </button>
          <p aria-live="polite">{note}</p>
          <p>
            <Link href="/home">Back to the desks</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
