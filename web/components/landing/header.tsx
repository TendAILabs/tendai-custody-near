import Link from "next/link";
import { links } from "./links";

export function Header() {
  return (
    <header className="hdr" data-hdr data-tone="L">
      <div className="wrap" data-load style={{ ["--ld" as string]: "1100ms" }}>
        <a className="logo" href={links.home} aria-label="TendAI Custody home">
          <span className="mk" aria-hidden="true">
            TC
          </span>
          <span>TendAI Custody</span>
        </a>
        <nav className="hdr-nav" aria-label="Site">
          <Link href={links.docs}>Docs</Link>
        </nav>
        <button
          className="mbtn"
          type="button"
          data-mbtn
          aria-label="Open menu"
          aria-expanded="false"
          aria-controls="menu"
        >
          <i />
          <i />
        </button>
      </div>
    </header>
  );
}
