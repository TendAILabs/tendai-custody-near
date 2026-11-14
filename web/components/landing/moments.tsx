import { Eyebrow } from "./eyebrow";

const moments = [
  {
    bg: "#0F766E",
    bd: "var(--h0)",
    kicker: "Moment 1",
    title: "A referral to a specialist",
    body: "The front desk asks and the patient approves on a phone, then the specialist opens the record for a short window instead of receiving it by fax or on a disc.",
  },
  {
    bg: "#1D4ED8",
    bd: "var(--h1)",
    kicker: "Moment 2",
    title: "A second-opinion share",
    body: "Imaging and notes can go to another doctor after the patient chooses what is included, reads the private summary, and keeps the choice to stop it later.",
  },
  {
    bg: "#BE123C",
    bd: "#E11D48",
    kicker: "Moment 3",
    title: "Changing your mind",
    body: "Revoking blocks later opens, while a copy that was already downloaded stays with its holder and the log shows that too.",
  },
  {
    bg: "#7C3AED",
    bd: "var(--h2)",
    kicker: "Vision",
    title: "What it can become",
    body: "The same consent layer can serve a clinic network, a hospital records team, and a health app that receives a de-identified slice.",
  },
];

export function Moments() {
  return (
    <section className="sec why" data-s="why" data-tone="L">
      <div className="wrap">
        <div className="eyebrow-row">
          <Eyebrow ix="06" label="three moments" />
        </div>
        <div className="rcards">
          {moments.map((moment) => (
            <div
              className="rcard above"
              key={moment.kicker}
              style={{ background: moment.bg, ["--rc-bd" as string]: moment.bd }}
            >
              <span className="eyebrow">{moment.kicker}</span>
              <h3>{moment.title}</h3>
              <p>{moment.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
