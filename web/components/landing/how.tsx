import { Eyebrow } from "./eyebrow";
import { FlowDiagram } from "./flow-diagram";

export function How() {
  return (
    <section className="sec how" id="how" data-s="how" data-tone="L">
      <div className="wrap">
        <div className="g" style={{ marginBottom: "var(--section-half)" }}>
          <div className="c-wide">
            <Eyebrow ix="05" label="how it works" />
          </div>
        </div>
        <div className="g" style={{ alignItems: "center", rowGap: "var(--section-half)" }}>
          <div className="c-half left">
            <h2 data-reveal>A relay between the patient and every place a record has to go</h2>
            <p data-reveal>
              The patient picks the sections and a recipient. The recipient gets an expiring, ticketed link, and the
              approval is logged on NEAR.
            </p>
            <p data-reveal>
              App copies are de-identified on a best-effort basis. The patient sees a preview before anything is sent.
            </p>
          </div>
          <div className="c-half">
            <FlowDiagram />
          </div>
        </div>
        <div className="g numrow">
          <div className="numcard above" data-reveal>
            <span className="num">01</span>
            <div>
              <h3>Patient-approved<br />transfers</h3>
              <p>
                The patient picks the sections and a recipient, and nothing leaves without a yes, including a
                second-opinion share.
              </p>
            </div>
          </div>
          <div className="numcard above" data-reveal>
            <span className="num">02</span>
            <div>
              <h3>A private summary,<br />read first</h3>
              <p>
                A NEAR AI Cloud TEE writes the summary, and apps get de-identified copies on a best-effort basis with a
                preview before sending.
              </p>
            </div>
          </div>
          <div className="numcard above" data-reveal>
            <span className="num">03</span>
            <div>
              <h3>A custody log<br />on NEAR</h3>
              <p>
                Approval, open and revoke are logged, expiry is enforced when someone tries to open and that writes no
                event, and revoking stops new access but cannot erase a downloaded copy.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
