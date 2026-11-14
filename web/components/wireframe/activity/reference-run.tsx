"use client";

import { REFERENCE_NOTE, REFERENCE_RUN } from "@/content/reference-run";
import { txUrl } from "@/lib/near/explorer";
import { Section } from "../c2";

export function ReferenceRun() {
  return (
    <Section index="R" title="Reference run" aside="Past guided demo. Not this visit.">
      <div data-testid="reference-run">
        <p>{REFERENCE_NOTE}</p>
        {REFERENCE_RUN.map((call, index) => (
          <div className="c2-nrow" key={call.id}>
            <span className="n">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <b>
                {call.method} · {call.who}
              </b>
              <p>{call.quote}</p>
              <p>
                <a href={txUrl(call.tx)} target="_blank" rel="noreferrer">
                  Transaction on the testnet explorer
                </a>
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
