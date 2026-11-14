import { Eyebrow } from "./eyebrow";

export function What() {
  return (
    <section className="sec who" id="what" data-s="who" data-tone="L">
      <div className="wrap">
        <div className="g">
          <div className="c-rail">
            <Eyebrow ix="03" label="what it is" />
          </div>
          <div className="c-main stack">
            <p className="lead" data-reveal>
              TendAI Custody moves medical records between clinics, hospitals and apps only after the patient{" "}
              <span className="mark">approves each share</span>. The patient sees who has what and can revoke access at
              any time.
            </p>
            <p className="lead" data-reveal>
              Before approving, the patient reads a summary made in a <span className="mark">NEAR AI Cloud TEE</span>.
              Our server checks the attestation at call time. In this hosted demo, the server signs for the demo
              patient with a key it holds. A connected wallet signs as itself. Approval, open and revoke land in a
              custody log on NEAR.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
