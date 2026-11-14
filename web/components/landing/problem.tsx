import { Eyebrow } from "./eyebrow";

export function Problem() {
  return (
    <section className="sec prob" data-s="prob" data-tone="D">
      <div className="wrap">
        <div className="eyebrow-row">
          <Eyebrow ix="04" label="the problem" />
        </div>
        <h2>
          <span className="ln"><span className="ln-in" data-mline>Records shouldn&apos;t</span></span>
          <span className="ln"><span className="ln-in" data-mline>travel by fax or</span></span>
          <span className="ln"><span className="ln-in" data-mline>by guesswork</span></span>
        </h2>
        <div className="g">
          <div className="c-fine fine" data-reveal>
            <span className="bar" aria-hidden="true" />
            <p>
              Referrals still run on faxes, portals and phone calls. Patients cannot see who received what, and clinics
              cannot tell which copy is current.
            </p>
            <p>
              Revoking stops new access right away but cannot erase a copy someone already downloaded.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
