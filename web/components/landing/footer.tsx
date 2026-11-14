import Link from "next/link";
import { ARROW_UP, Arrow } from "./icons";
import { links } from "./links";

export function Footer() {
  return (
    <footer className="sec foot" data-s="foot" data-tone="D">
      <div className="wrap">
        <div className="g">
          <div className="fb">
            <a className="logo" href={links.home} style={{ transition: "none" }}>
              <span className="mk" aria-hidden="true">
                TC
              </span>
              <span>TendAI Custody</span>
            </a>
            <p className="tag">
              Patient-approved record transfers with a custody log on NEAR, shown here as a prototype with example data.
            </p>
          </div>
          <div className="fc">
            <span className="eyebrow">Navigation</span>
            <a href={links.home}>Home</a>
            {/* TODO: no standalone how-it-works route. */}
            <a href={links.how}>How it works</a>
            <Link href={links.proof}>Proof on NEAR</Link>
            <Link href={links.demo}>Guided demo</Link>
            <Link href={links.docs}>Docs</Link>
          </div>
          <div className="fc">
            <span className="eyebrow">Notes</span>
            {/* TODO: no security-notes route; anchor stays on the what-it-is section. */}
            <a href={links.security}>Security notes</a>
            <span className="t dim">Example data only</span>
            <span className="t dim">Built for NEAR HACKATHON, privacy and security tracks</span>
          </div>
          <div className="fc">
            <span className="eyebrow">Contact</span>
            <a href="mailto:contact@tendaicustody.app">contact@tendaicustody.app</a>
            <Link href="/help#support">Contact support</Link>
            <span className="t dim">Bangkok, UTC+7</span>
          </div>
        </div>
        <div className="legal">
          <p>
            Prototype. Designed around HIPAA principles. De-identification is best effort, with a preview before
            sending. Revoking stops new access but cannot erase copies already downloaded. All data shown is fictional.
          </p>
          <button className="btt" type="button" data-btt>
            Back to top <Arrow d={ARROW_UP} />
          </button>
        </div>
      </div>
    </footer>
  );
}
