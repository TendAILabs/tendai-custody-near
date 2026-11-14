import { Icon } from "./icons";

const targets = [
  { id: "t0", name: "clinic" as const, label: "Clinic", hue: "var(--h0)" },
  { id: "t1", name: "hospital" as const, label: "Hospital", hue: "var(--h1)" },
  { id: "t2", name: "second" as const, label: "Second opinion", hue: "var(--h2)" },
  { id: "t3", name: "app" as const, label: "Apps, de-identified", hue: "var(--h3)" },
];

export function FlowDiagram() {
  return (
    <div className="conn above" data-conn>
      <svg className="cs" data-cs aria-hidden="true" />
      <div className="cgrid">
        <div className="nw">
          <div className="node" data-node="source">
            <Icon name="patient" />
          </div>
          <span className="nl">Patient</span>
        </div>
        <div className="sp" aria-hidden="true" />
        <div className="nw">
          <div className="node" data-node="hub">
            <Icon name="hub" />
          </div>
          <span className="nl">TendAI Custody</span>
        </div>
        <div className="sp" aria-hidden="true" />
        <div className="targets">
          {targets.map((target) => (
            <div className="nw" key={target.id}>
              <div className="node" data-node={target.id} style={{ ["--nc" as string]: target.hue }}>
                <Icon name={target.name} />
              </div>
              <span className="nl">{target.label}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="cnote">Example flow with fictional data. Approval, open and revoke are logged on NEAR.</p>
    </div>
  );
}
