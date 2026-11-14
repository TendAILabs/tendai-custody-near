import type { ReactNode } from "react";
import Link from "next/link";
import {
  ACTORS,
  CONTRACT_METHODS,
  DOC_DESCRIPTION,
  DOC_SECTIONS,
  EXPLORER_ACCOUNT,
  FAQ,
  FLOW_STEPS,
  WHITEPAPER_PDF_URL,
  WHITEPAPER_URL,
  type DocBlock,
  type DocSection,
} from "../../content/docs";

const SAFE_LINK = /^(?:\/(?!\/)|https:\/\/testnet\.nearblocks\.io\/|https:\/\/truenav\.app(?:\/|$))/;

function rich(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    if (match[1]) {
      nodes.push(<code key={key}>{match[1]}</code>);
    } else {
      const label = match[2] ?? "";
      const href = match[3] ?? "";
      nodes.push(
        SAFE_LINK.test(href) ? (
          <a key={key} href={href}>
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    key += 1;
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Rich({ text }: { text: string }) {
  return <>{rich(text)}</>;
}

function FlowDiagram() {
  return (
    <figure>
      <svg className="docs-flow-svg" viewBox="0 0 720 56" role="img" aria-labelledby="flow-title flow-desc">
        <title id="flow-title">Referral steps</title>
        <desc id="flow-desc">
          Clinic creates a record, clinic requests a referral, patient approves, hospital opens, patient revokes, hospital open is refused.
        </desc>
        <line x1="28" y1="28" x2="692" y2="28" stroke="#C9D0DB" strokeWidth="2" />
        {FLOW_STEPS.map((step, index) => {
          const x = 28 + index * 132;
          const fill = step.hue === "hospital" ? "#3B82F6" : step.hue === "refused" ? "#C4261D" : step.hue === "patient" ? "#0F172A" : "#0D9488";
          return (
            <g key={step.n}>
              <circle cx={x} cy="28" r="12" fill={fill} />
              <text x={x} y="32" textAnchor="middle" fill="#F4F6F8" fontSize="10" fontFamily="ui-monospace, monospace">
                {step.n}
              </text>
            </g>
          );
        })}
      </svg>
      <ol className="docs-flow">
        {FLOW_STEPS.map((step) => (
          <li key={step.n}>
            <span className="num">{step.n}</span>
            <div>
              <span className={`who ${step.hue}`}>{step.actor}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <figcaption className="docs-kicker">Same six steps as the list. Colors mark the actor, not a status badge.</figcaption>
    </figure>
  );
}

function Methods() {
  return (
    <div className="docs-table-wrap">
      <table className="docs-table">
        <caption>Public methods on the schema 2 contract. Source: contract/src/lib.rs.</caption>
        <thead>
          <tr>
            <th scope="col">Method</th>
            <th scope="col">Kind</th>
            <th scope="col">Arguments</th>
            <th scope="col">Rule</th>
          </tr>
        </thead>
        <tbody>
          {CONTRACT_METHODS.map((method) => (
            <tr key={method.name}>
              <th scope="row">
                <code>{method.name}</code>
              </th>
              <td>{method.kind}</td>
              <td>{method.args}</td>
              <td>{method.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function allowedHref(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("https://")) return value;
  return null;
}

function Whitepaper() {
  const page = allowedHref(WHITEPAPER_URL);
  const pdf = allowedHref(WHITEPAPER_PDF_URL);
  if (!page && !pdf) {
    return (
      <div className="docs-paper" data-testid="whitepaper-card">
        <p className="docs-kicker">Coming</p>
        <h3>The whitepaper is coming</h3>
        <p>There is no page link and no PDF download while both config values are null.</p>
      </div>
    );
  }
  return (
    <div className="docs-paper" data-testid="whitepaper-card">
      <p className="docs-kicker">Paper</p>
      <h3>Whitepaper</h3>
      <div className="docs-paper-links">
        {page ? <a href={page}>Read the whitepaper</a> : null}
        {pdf ? <a href={pdf}>Download the PDF</a> : null}
      </div>
    </div>
  );
}

function FaqList() {
  return (
    <div className="docs-faq">
      {FAQ.map((item, index) => (
        <details key={item.id} id={item.id}>
          <summary>
            <h3>
              <span className="docs-kicker" style={{ display: "inline", marginRight: 8 }}>
                {String(index + 1).padStart(2, "0")}
              </span>
              {item.question}
            </h3>
          </summary>
          <div className="a">
            {item.answer.map((paragraph) => (
              <p key={paragraph}>
                <Rich text={paragraph} />
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function BlockView({ block }: { block: DocBlock }) {
  if (block.kind === "p") {
    return (
      <p>
        <Rich text={block.text} />
      </p>
    );
  }
  if (block.kind === "ul") {
    return (
      <ul>
        {block.items.map((item) => (
          <li key={item}>
            <Rich text={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (block.kind === "table") {
    return (
      <div className="docs-table-wrap">
        <table className="docs-table">
          <caption>{block.table.caption}</caption>
          <thead>
            <tr>
              {block.table.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.table.rows.map((row) => (
              <tr key={row.join("|")}>
                {row.map((cell, index) =>
                  index === 0 ? (
                    <th key={cell} scope="row">
                      <Rich text={cell} />
                    </th>
                  ) : (
                    <td key={cell}>
                      <Rich text={cell} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.kind === "actors") {
    return (
      <div className="docs-actors">
        {ACTORS.map((actor) => (
          <article key={actor.name} className="docs-actor">
            <h3>{actor.name}</h3>
            <span className="role">{actor.role}</span>
            <p>{actor.does}</p>
          </article>
        ))}
      </div>
    );
  }
  if (block.kind === "flow") return <FlowDiagram />;
  if (block.kind === "methods") return <Methods />;
  if (block.kind === "whitepaper") return <Whitepaper />;
  return <FaqList />;
}

function SectionView({ section }: { section: DocSection }) {
  const callout = section.id === "judges";
  return (
    <section id={section.id} aria-labelledby={`${section.id}-title`} className={callout ? "docs-callout" : undefined}>
      <p className="docs-kicker">
        {section.index} / {section.kicker}
      </p>
      <h2 id={`${section.id}-title`}>{section.title}</h2>
      {section.blocks.map((block, index) => (
        <BlockView key={`${section.id}-${index}`} block={block} />
      ))}
    </section>
  );
}

function Toc() {
  return (
    <ol>
      {DOC_SECTIONS.map((section) => (
        <li key={section.id}>
          <a href={`#${section.id}`}>
            <span className="n">{section.index}</span>
            <span>{section.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

export function DocsView({ tools }: { tools?: ReactNode }) {
  return (
    <div className="docs">
      <a className="skip" href="#docs-main">
        Skip to content
      </a>
      <header className="docs-top">
        <Link className="docs-brand" href="/">
          <span className="mk" aria-hidden="true">
            TC
          </span>
          <span>TendAI Custody</span>
        </Link>
        <nav aria-label="Site">
          <a className="quiet" href="/home?guide=1">
            Guided demo
          </a>
          <a className="quiet" href="/onchain?desk=proof">
            Proof
          </a>
          <a href="/docs" aria-current="page">
            Docs
          </a>
          <a href={EXPLORER_ACCOUNT}>Explorer</a>
        </nav>
        {tools ? <div className="docs-tools">{tools}</div> : null}
      </header>
      <div className="docs-shell">
        <aside className="docs-toc">
          <nav aria-label="On this page">
            <p>On this page</p>
            <Toc />
          </nav>
        </aside>
        <div>
          <details className="docs-toc-m">
            <summary>
              <span className="lab">On this page</span>
            </summary>
            <nav aria-label="On this page">
              <Toc />
            </nav>
          </details>
          <main id="docs-main" className="docs-main">
            <h1>Documentation</h1>
            <p className="docs-lede">{DOC_DESCRIPTION}</p>
            {DOC_SECTIONS.map((section) => (
              <SectionView key={section.id} section={section} />
            ))}
          </main>
        </div>
      </div>
      <footer className="docs-foot">
        <div className="inner">
          <p>
            Prototype on NEAR testnet. Designed around HIPAA principles. De-identification is best effort, with a
            preview. Revoking stops new access and cannot erase copies already downloaded. Fictional data only.
          </p>
          <nav aria-label="Footer">
            <Link href="/">Home</Link>
            <a href="/home?guide=1">Guided demo</a>
            <a href="/help">Help</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
