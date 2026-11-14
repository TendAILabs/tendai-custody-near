import Link from "next/link";
import { links } from "./links";

const items = [
  { n: "01", href: links.home, label: "Home", color: "var(--h0)" },
  { n: "02", href: links.how, label: "How it works", color: "#93C5FD" },
  { n: "03", href: links.proof, label: "Proof on NEAR", color: "#C4B5FD" },
  { n: "04", href: links.demo, label: "Guided demo", color: "#FCD34D" },
  { n: "05", href: links.docs, label: "Docs", color: "#5EEAD4" },
] as const;

function Item({ n, href, label, color }: (typeof items)[number]) {
  const inner = (
    <>
      <span className="n" style={{ color }}>
        {n}
      </span>
      <span className="t">{label}</span>
    </>
  );
  if (href.startsWith("#")) {
    return (
      <a className="mi" data-mi href={href}>
        {inner}
      </a>
    );
  }
  return (
    <Link className="mi" data-mi href={href}>
      {inner}
    </Link>
  );
}

export function Menu() {
  return (
    <div className="menu" id="menu" data-menu data-tone="D" role="dialog" aria-modal="true" aria-label="Site menu">
      <div className="menu-cols">
        <nav data-mlist aria-label="Site">
          {items.map((item) => (
            <Item key={item.n} {...item} />
          ))}
        </nav>
        <div className="menu-field" data-field />
      </div>
      <div className="wrap menu-info">
        <div>
          <span className="eyebrow">Contact</span>
          <Link href={links.support}>Contact support</Link>
        </div>
        <div>
          <span className="eyebrow">Status</span>
          <p>Prototype. Fictional example data only.</p>
        </div>
        <div>
          <span className="eyebrow">Time zone</span>
          <p>Bangkok, UTC+7</p>
        </div>
      </div>
    </div>
  );
}
