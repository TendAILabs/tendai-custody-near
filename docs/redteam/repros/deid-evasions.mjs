// Offline de-identification evasions. Fictional identifiers only.
// Run from the repo root: node docs/redteam/repros/deid-evasions.mjs
// No model calls.

import { scrubText } from "../../../web/lib/deid/scrub.ts";
import { runDeidPipeline } from "../../../web/lib/deid/pipeline.ts";
import { deidSendAllowed } from "../../../web/lib/relay/panel.ts";

const identifiers = [
  { category: "name", value: "Maya Okafor" },
  { category: "dob", value: "1968-03-14" },
  { category: "mrn", value: "RB-004417" },
  { category: "address", value: "41 Alder Lane, Fictionville" },
  { category: "phone", value: "555-0142" },
  { category: "insurance", value: "FX-889-2210" },
];

const cases = [
  ["exact name", "Patient Maya Okafor was seen."],
  ["zero-width inside name", "Patient Maya\u200bOkafor was seen."],
  ["name with middle initial", "Patient Maya Q. Okafor was seen."],
  ["lowercase surname only in a sentence", "Ms okafor called the desk."],
  ["dotted iso date", "Seen on 1968.03.14 for a check."],
  ["day month year", "Born 14 Mar 1968 in the chart."],
  ["slash year first", "DOB 1968/03/14 is on the header."],
  ["ordinal month", "Born March 14th, 1968 per the form."],
  ["lowercase mrn", "Chart mrn rb-004417 is filed."],
  ["mrn without dash", "Chart MRN RB004417 is filed."],
  ["spaced mrn", "Chart MRN RB 004417 is filed."],
  ["seven digit phone", "Callback 5550142 this afternoon."],
  ["dotted short phone", "Callback 555.0142 this afternoon."],
  ["abbreviated street", "Lives at 41 Alder Ln, Fictionville."],
  ["free-text other fictional name", "Neighbor Quinlan Voss drove the patient."],
  ["free-text other phone", "Alt phone 5550199 listed by the neighbor."],
  ["fullwidth digits in a year", "Born １９６８-03-14 per a pasted label."],
  ["insurance with spaces", "Plan FX 889 2210 is on the card."],
];

let slipped = 0;
for (const [name, text] of cases) {
  const scrubbed = scrubText(text, { identifiers, anchorDate: "2026-10-14" });
  const pipeline = await runDeidPipeline({
    text,
    identifiers,
    anchorDate: "2026-10-14",
    client: null,
  });
  const allowed = deidSendAllowed({
    scrubbed: scrubbed.text,
    identifiers: identifiers.map((item) => item.value),
    spans: [],
  });
  const recognizable = /maya|okafor|quinlan|voss|1968|１９６８|004417|5550142|555-0142|555\.0142|5550199|alder|fx-? ?889|fictionville/i.test(
    scrubbed.text,
  );
  if (pipeline.ok && recognizable) slipped += 1;
  console.log(
    JSON.stringify({
      name,
      pipelineOk: pipeline.ok,
      localOnly: pipeline.ok ? pipeline.localOnly : false,
      sendAllowed: allowed,
      recognizableAfterScrub: recognizable,
      after: scrubbed.text,
    }),
  );
}
console.log(JSON.stringify({ cases: cases.length, slippedPastLocalPipeline: slipped }));
