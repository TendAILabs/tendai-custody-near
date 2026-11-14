import Link from "next/link";
import { GITHUB_REPO, HACKATHON_LINE } from "@/content/reference-run";
import { TESTNET_CONTRACT } from "@/lib/fixtures";
import { accountUrl } from "@/lib/near/explorer";
import { Eyebrow } from "./eyebrow";
import { ARROW_DOWN, ARROW_RIGHT, Arrow } from "./icons";
import { links } from "./links";

export function Hero() {
  return (
    <section className="sec hero" data-s="hero" data-tone="L">
      <div className="wrap">
        <div className="row-top" data-load style={{ ["--ld" as string]: "900ms" }}>
          <Eyebrow ix="01" label="patient-approved" />
        </div>
        <h1 className="h-display">
          <span className="ln"><span className="ln-in" data-hline>Patients <span className="verb" data-verb>share</span>,</span></span>
          <span className="ln"><span className="ln-in" data-hline><span className="verb" data-verb>approve</span>, and</span></span>
          <span className="ln"><span className="ln-in" data-hline><span className="verb" data-verb>revoke</span> their</span></span>
          <span className="ln"><span className="ln-in" data-hline>own records</span></span>
        </h1>
        <p className="sub above" data-load style={{ ["--ld" as string]: "1000ms" }}>
          Records move between clinics, hospitals and apps only after the patient approves, and approval, open and
          revoke are written to a custody log on <b>NEAR</b>, which you can walk through yourself in about 3 minutes.
        </p>
        <div className="g hero-foot above" data-load style={{ ["--ld" as string]: "1100ms" }}>
          <div className="c-half">
            <Link className="btn" href={links.demo} data-testid="try-the-demo">
              Try the 3-minute demo <Arrow d={ARROW_RIGHT} />
            </Link>
            <Link className="lnk" href={links.proof} style={{ marginLeft: 16 }}>
              Watch the proof
            </Link>
            <Link className="lnk" href={links.docs} style={{ marginLeft: 16 }}>
              Read the docs
            </Link>
          </div>
          <div className="c-half">
            <a className="cue" href={links.wall} style={{ marginRight: 72 }}>
              <Arrow d={ARROW_DOWN} />
              Scroll
            </a>
          </div>
        </div>
        <p className="note above" data-load style={{ ["--ld" as string]: "1200ms" }}>
          Designed around HIPAA principles. Every name and number on this page is fictional example data. {HACKATHON_LINE}{" "}
          <a href={accountUrl(TESTNET_CONTRACT)} target="_blank" rel="noreferrer">
            Contract on testnet
          </a>
          {" · "}
          <a href={GITHUB_REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          {" · "}
          <Link href="/onchain">Proof on NEAR</Link>
        </p>
      </div>
    </section>
  );
}
