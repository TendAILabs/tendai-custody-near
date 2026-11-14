"use client";

import { txUrl } from "@/lib/near/explorer";
import { ATTACK_INTRO, ATTACK_LIMIT, ATTACK_LINES } from "@/lib/near/proof";
import { Section } from "../c2";

export function WhatYouCanVerify() {
  return (
    <Section index="V" title="What you can verify" aside="Recorded earlier. Not a live run.">
      <div data-testid="verify-panel">
        <p>{ATTACK_INTRO}</p>
        {ATTACK_LINES.map((line, index) => (
          <div className="c2-nrow" key={line.id}>
            <span className="n">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <b>{line.title}</b>
              <p>{line.text}</p>
              <p>{line.where}.</p>
              {line.tx ? (
                <p>
                  <a href={txUrl(line.tx)} target="_blank" rel="noreferrer">
                    Transaction on the testnet explorer
                  </a>
                </p>
              ) : (
                <p>No transaction. This check is local.</p>
              )}
            </div>
          </div>
        ))}
        <p>{ATTACK_LIMIT}</p>
      </div>
    </Section>
  );
}
