"use client";

import { useEffect, useState } from "react";
import type { DirectoryResult, KeyView } from "@/lib/near/directory";
import { accountUrl } from "@/lib/near/explorer";
import { Section } from "../c2";

function shortKey(publicKey: string): string {
  const [prefix, body] = publicKey.split(":");
  if (!body || body.length < 16) return publicKey;
  return `${prefix}:${body.slice(0, 8)}...${body.slice(-6)}`;
}

function KeyLine({ item }: { item: KeyView }) {
  const methods = item.methods.length > 0 ? item.methods.join(", ") : "no method names on this key";
  const detail = item.kind === "full-access" ? item.label : methods;
  return (
    <p>
      <span className="mono" title={item.publicKey}>
        {shortKey(item.publicKey)}
      </span>
      {". "}
      {detail}.
    </p>
  );
}

export function ContractPanel() {
  const [body, setBody] = useState<DirectoryResult | null>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    let cancel = false;
    fetch("/api/contract/directory")
      .then(async (response) => {
        const parsed = (await response.json()) as DirectoryResult;
        if (cancel) return;
        if (!parsed || typeof parsed !== "object" || !("ok" in parsed)) {
          setFailed("The contract could not be read. Try again in a moment.");
          return;
        }
        setBody(parsed);
        if (!parsed.ok) setFailed(parsed.error);
      })
      .catch(() => {
        if (!cancel) setFailed("The contract could not be read. Try again in a moment.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  const contractId = body?.contractId ?? "";
  const explorer = body?.explorerUrl || (contractId ? accountUrl(contractId) : "");
  const fullAccess = body?.ok ? body.contractKeys.filter((key) => key.label === "upgradable") : [];

  return (
    <Section index="C" title="Live contract" aside="View calls only. Cached for a minute.">
      <div data-testid="contract-panel">
        {!body && !failed ? <p>Reading the contract.</p> : null}
        {failed ? <p className="c2-note bad">{failed}</p> : null}
        {contractId && explorer ? (
          <p>
            Contract{" "}
            <a href={explorer} target="_blank" rel="noreferrer">
              {contractId}
            </a>
            .
          </p>
        ) : null}
        {body?.ok ? (
          <>
            <p>
              Code hash <span className="mono">{body.codeHash}</span>
            </p>
            <p>
              Owner{" "}
              <a href={accountUrl(body.owner)} target="_blank" rel="noreferrer">
                {body.owner}
              </a>
            </p>
            <p>
              {fullAccess.length === 1
                ? "The contract account has one full-access key, labelled upgradable. It can still deploy new code."
                : fullAccess.length === 0
                  ? "No full-access key was returned for the contract account."
                  : `The contract account has ${fullAccess.length} full-access keys, labelled upgradable. Those keys can still deploy new code.`}
            </p>
            {body.contractKeys.map((key) => (
              <KeyLine key={key.publicKey} item={key} />
            ))}
            <p>{body.actors.length === 0 ? "list_actors returned no actors." : `${body.actors.length} actors from list_actors.`}</p>
            {body.actors.map((actor, index) => (
              <div className="c2-nrow" key={actor.accountId}>
                <span className="n">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <b>
                    {actor.displayName}
                    {actor.active ? "" : " (inactive)"}
                  </b>
                  <p>
                    {actor.role || "role not set"}. {actor.accountId}.
                  </p>
                  {actor.keyError ? <p>{actor.keyError}</p> : null}
                  {actor.keys.length === 0 && !actor.keyError ? <p>No access keys were returned.</p> : null}
                  {actor.keys.map((key) => (
                    <KeyLine key={key.publicKey} item={key} />
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </Section>
  );
}
