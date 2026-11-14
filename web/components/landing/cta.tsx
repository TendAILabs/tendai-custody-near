import Link from "next/link";
import { Eyebrow } from "./eyebrow";
import { ARROW_RIGHT, Arrow } from "./icons";
import { links } from "./links";

export function Cta() {
  return (
    <section className="sec cta" id="cta" data-s="cta" data-tone="SIG">
      <div className="wrap">
        <Eyebrow ix="09" label="try it" />
        <h2>
          <span className="ln"><span className="ln-in" data-cline>See a referral</span></span>
          <span className="ln"><span className="ln-in" data-cline>from approval</span></span>
          <span className="ln"><span className="ln-in" data-cline>to revoke</span></span>
        </h2>
        <div className="cta-row above">
          <Link className="btn" href={links.demo} data-testid="try-the-demo-cta">
            Try the 3-minute demo <Arrow d={ARROW_RIGHT} />
          </Link>
          <a className="lnk" href="mailto:contact@tendaicustody.app">
            contact@tendaicustody.app
          </a>
          <Link className="lnk" href={links.support}>
            Contact support
          </Link>
          {/* TODO: no security-notes route; anchor stays on the what-it-is section. */}
          <a className="lnk" href={links.security}>
            Security notes
          </a>
        </div>
      </div>
    </section>
  );
}
