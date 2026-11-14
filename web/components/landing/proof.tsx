import Link from "next/link";
import { GITHUB_REPO, HACKATHON_LINE, REFERENCE_RUN } from "@/content/reference-run";
import { TESTNET_CONTRACT } from "@/lib/fixtures";
import { accountUrl, txUrl } from "@/lib/near/explorer";
import { Eyebrow } from "./eyebrow";

const displayQuote: Record<string, string> = {
  approve_share: "Maya approved a share with Brindleglass Hospital.",
  request_open_hospital: "Brindleglass Hospital opened the record. The ticket was valid for a short window.",
};

const shown = ["approve_share", "request_open_hospital", "revoke_share"].map((id) => {
  const call = REFERENCE_RUN.find((item) => item.id === id);
  if (!call) throw new Error(id);
  return { ...call, quote: displayQuote[id] ?? call.quote };
});

export function Proof() {
  return (
    <section className="sec proof" id="proof" data-s="proof" data-tone="D">
      <div className="wrap">
        <Eyebrow ix="08" label="proof on near" />
        <h2 data-reveal>Proof you<br />can check</h2>
        <p className="note" data-reveal>
          {HACKATHON_LINE} The build window was 1 to 14 November 2026 UTC, with judging and results from 16 to 18
          November across 13 tracks where privacy is primary and security is secondary, no result is claimed, and this
          page is not an endorsement, while TendAI Labs also entered truenav.app as a separate project. These three
          calls are from the guided demo reference run on testnet rather than example labels, and the build config is pinned.
        </p>
        <div className="qs">
          {shown.map((event) => (
            <div className="q" data-reveal key={event.id}>
              <blockquote>{event.quote}</blockquote>
              <div className="meta">
                <span>{event.method}</span>
                <span>Reference run</span>
                <a href={txUrl(event.tx)} target="_blank" rel="noreferrer">
                  Testnet transaction
                </a>
                <span className="pill ok">On testnet</span>
              </div>
            </div>
          ))}
          <div className="q" data-reveal>
            <blockquote>
              11 / 11 checks passed and 5 attempts refused, with three of the checks local and not testnet transactions.
            </blockquote>
            <div className="meta">
              <span>attack-demo</span>
              <span>phi-scan: 0 hits in 50 test terms</span>
              <span className="pill ok">Recorded run</span>
            </div>
          </div>
        </div>
        <p className="links" data-reveal>
          <a href={accountUrl(TESTNET_CONTRACT)} target="_blank" rel="noreferrer">
            Contract on testnet
          </a>
          <Link href="/onchain">Proof on NEAR</Link>
          <a href={GITHUB_REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </p>
      </div>
    </section>
  );
}
