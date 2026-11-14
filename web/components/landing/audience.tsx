import Image from "next/image";
import { Eyebrow } from "./eyebrow";

const clients = [
  { title: "Riverbend", em: "Family", space: true, line: "Primary care" },
  { title: "Brindleglass Hospital", em: "", space: false, line: "Receives referrals" },
  { title: "Northgate", em: "Heart", space: true, line: "Heart institute" },
  { title: "Dr. Sofia Reyes", em: "", space: false, line: "Second opinion" },
  { title: "Pulse", em: "Fit", space: false, line: "Health app" },
];

const roles = [
  {
    src: "/img/illustrations/role-01.webp",
    alt: "Illustration of a clinic desk, a monitor, a phone with a check, and a fax machine marked with an X.",
    title: "Front desk",
    line: "Sends the referral",
  },
  {
    src: "/img/illustrations/role-02.webp",
    alt: "Illustration of a filing shelf linked to a list card.",
    title: "Records team",
    line: "Reads the custody log",
  },
  {
    src: "/img/illustrations/role-03.webp",
    alt: "Illustration of a small clinic beside a phone showing a short summary.",
    title: "Patient",
    line: "Approves and revokes",
  },
];

export function Audience() {
  return (
    <section className="sec for" data-s="for" data-tone="L">
      <div className="wrap">
        <div className="g">
          <div className="c-rail">
            <Eyebrow ix="07" label="who it is for" extra={<span className="chip">Fictional</span>} />
          </div>
          <div className="c-main">
            <p className="lead" data-reveal>
              Built for <span className="mark">clinic staff first</span>. TendAI Custody handles the sharing layer so
              front desks and care teams stay on care, not paperwork.
            </p>
          </div>
        </div>
        <div className="clients g2" style={{ marginTop: "var(--section-half)" }}>
          {clients.map((client) => (
            <div className="cl above" key={client.line + client.title}>
              <span className="wm">
                {client.title}
                {client.em ? (
                  <>
                    {client.space ? " " : null}
                    <em>{client.em}</em>
                  </>
                ) : null}
              </span>
              <span className="eyebrow">{client.line}</span>
            </div>
          ))}
        </div>
        <div className="clients g2" style={{ marginTop: "var(--gutter)" }}>
          {roles.map((role) => (
            <div className="cl above" key={role.title}>
              <Image className="role-art" src={role.src} alt={role.alt} width={1280} height={720} />
              <span className="wm">{role.title}</span>
              <span className="eyebrow">{role.line}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
