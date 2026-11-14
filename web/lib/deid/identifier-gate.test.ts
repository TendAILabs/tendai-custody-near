import assert from "node:assert/strict";
import { test } from "node:test";
import { DEID_AFTER, MAYA, SECTION_BODY } from "../fixtures.ts";
import { scrubText, textHasPersonalIdentifier } from "./scrub.ts";

const identifiers = [
  { category: "name", value: "Maya Okafor" },
  { category: "dob", value: "1968-03-14" },
  { category: "mrn", value: "RB-004417" },
  { category: "address", value: "41 Alder Lane, Fictionville" },
  { category: "phone", value: "555-0142" },
  { category: "insurance", value: "FX-889-2210" },
];

const caught = [
  "QUINLAN VOSS was seen.",
  "quinlan voss was seen.",
  "Jane Doe was seen.",
  "Quin\u200blan Voss was seen.",
  "Reach qvoss@example.com about the chart.",
  "Reach qvoss\uFF20example.com about the chart.",
  "Born 2001-03-14.",
  "Born 03/14/1971.",
  "Born 14th of March, 1968.",
  "Born March 14, 1968.",
  "The patient is 55 years old.",
  "Callback 555\u20130142 today.",
  "Callback 555\u20140142 today.",
  "Callback 555\u22120142 today.",
  "Callback 555\uFF0D0142 today.",
  "Chart MRN RB_004417 is filed.",
  "Lives at nine birch road.",
  "QuinlanVoss was seen.",
  "QUINLANVOSS was seen.",
  "The chart says jane doe was seen.",
  "Jane D\u043Ee was seen.",
  "Jane D\u03BFe was seen.",
  "Write qvoss(at)example.com about the chart.",
  "Write qvoss[at]example.com about the chart.",
  "Write qvoss at example.com about the chart.",
  "Write qvoss at example dot com about the chart.",
  "Born 14.03.1968.",
  "Born 14-03-1968.",
  "Callback 555\u00AD0142 today.",
  "Callback 555\u20150142 today.",
  "The patient is 55-year-old.",
  "The patient is aged 55.",
];

const clinical = [
  "Referral to cardiology.",
  "Referral to cardiology is for a retest. No examination findings or medication entries appear elsewhere in the record beyond that reason.",
  "Referred for chest tightness. Lisinopril 20 mg daily.",
  "Lisinopril 5 mg daily.",
  "BP 120/80.",
  "LDL 168 mg/dL, HDL 41, A1c 5.9%.",
  "A 5-year follow-up was planned.",
];

test("RR-06 and RR-07 the gate catches the retest misses and the cases it already caught", () => {
  for (const text of caught) {
    assert.equal(textHasPersonalIdentifier(text), true, text);
  }
});

test("RR-07 clinical text does not trip the identifier gate", () => {
  for (const text of clinical) {
    assert.equal(textHasPersonalIdentifier(text), false, text);
  }
});

const missedDates = [
  "2015-03-14",
  "03/14/2015",
  "3/14/2015",
  "October 28, 2026",
  "Oct 28, 2026",
  "28 October 2026",
  "28th October 2000",
  "October 28th 2026",
  "DOB: 2015-03-14",
];

test("M1 the gate catches dates the scrubber rewrites", () => {
  for (const text of missedDates) {
    assert.equal(textHasPersonalIdentifier(text), true, text);
    const scrubbed = scrubText(text, { identifiers: [], anchorDate: "2026-10-14" }).text;
    assert.match(scrubbed, /Day /, scrubbed);
    assert.equal(textHasPersonalIdentifier(scrubbed), false, `${text} -> ${scrubbed}`);
  }
});

test("M1 day offsets and the guided demo fixture summary pass the gate", () => {
  assert.equal(textHasPersonalIdentifier(DEID_AFTER), false, DEID_AFTER);
  const chart = `${MAYA.name} born ${MAYA.dob}, MRN ${MAYA.mrn}, ${MAYA.address}, ${MAYA.phone}, ${MAYA.insurer}. ${SECTION_BODY.history} ${SECTION_BODY.labs}`;
  const scrubbed = scrubText(chart, {
    identifiers: [
      { category: "name", value: MAYA.name },
      { category: "dob", value: MAYA.dob },
      { category: "mrn", value: MAYA.mrn },
      { category: "address", value: MAYA.address },
      { category: "phone", value: MAYA.phone },
      { category: "insurance", value: MAYA.insurer },
    ],
    anchorDate: "2026-10-14",
  }).text;
  assert.equal(scrubbed.includes("2026-10-28"), false, scrubbed);
  assert.equal(scrubbed.includes(MAYA.dob), false, scrubbed);
  assert.equal(textHasPersonalIdentifier(scrubbed), false, scrubbed);
  assert.equal(
    textHasPersonalIdentifier(
      "Referred for chest tightness on stairs that resolves with rest. BP 152/94, LDL 168 mg/dL, HDL 41, A1c 5.9%. Lisinopril 20 mg daily and atorvastatin 20 mg daily.",
    ),
    false,
  );
});

test("RR-06 scrub removes the retest misses and leaves clinical wording", () => {
  for (const text of caught) {
    const scrubbed = scrubText(text, { identifiers, anchorDate: "2026-10-14" }).text;
    assert.equal(/quinlanvoss|jane doe|qvoss|1968|0142|55-year-old|aged 55/i.test(scrubbed), false, `${text} -> ${scrubbed}`);
    assert.equal(textHasPersonalIdentifier(scrubbed), false, `${text} -> ${scrubbed}`);
  }
  for (const text of clinical) {
    const scrubbed = scrubText(text, { identifiers, anchorDate: "2026-10-14" }).text;
    assert.equal(textHasPersonalIdentifier(scrubbed), false, scrubbed);
    if (text.includes("cardiology")) assert.match(scrubbed, /cardiology/);
    if (text.includes("5 mg")) assert.match(scrubbed, /5 mg/);
    if (text.includes("120/80")) assert.match(scrubbed, /120\/80/);
    if (text.includes("LDL 168")) assert.match(scrubbed, /LDL 168/);
    if (text.includes("chest tightness")) assert.match(scrubbed, /chest tightness/);
  }
});
