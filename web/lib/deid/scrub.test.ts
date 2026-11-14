import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { scrubText, type Identifier } from "./scrub.ts";

type Persona = {
  fictional: boolean;
  id: string;
  name: string;
  dob: string;
  mrn: string;
  address: string;
  phone: string;
  email: string;
  insurance_id: string;
  anchor_date: string;
  sections: Record<string, string>;
};

const fixture = JSON.parse(readFileSync(new URL("../../../fixtures/personas.json", import.meta.url), "utf8")) as {
  fictional: boolean;
  personas: Persona[];
};

const maya = fixture.personas.find((persona) => persona.id === "maya-okafor");
if (!maya || !fixture.fictional || !maya.fictional) {
  throw new Error("Maya fixture missing or not marked fictional");
}

const planted = {
  phone: "555-013-0199",
  ssn: "219-33-8841",
  account: "0044178821",
  longDate: "October 28, 2026",
  usDate: "10/14/2026",
};

function chart(): string {
  return [
    `Patient ${maya!.name}.`,
    `DOB ${maya!.dob}. MRN ${maya!.mrn}.`,
    `Address ${maya!.address}. Phone ${maya!.phone}. Email ${maya!.email}.`,
    `Insurer ${maya!.insurance_id}.`,
    Object.values(maya!.sections).join(" "),
    `Planted callback ${planted.phone}, tax-style ${planted.ssn}, account ${planted.account}.`,
    `Also written ${planted.longDate} and ${planted.usDate}.`,
  ].join(" ");
}

function identifiers(): Identifier[] {
  return [
    { category: "name", value: maya!.name },
    { category: "dob", value: maya!.dob },
    { category: "mrn", value: maya!.mrn },
    { category: "address", value: maya!.address },
    { category: "phone", value: maya!.phone },
    { category: "email", value: maya!.email },
    { category: "insurance", value: maya!.insurance_id },
    { category: "phone", value: planted.phone },
    { category: "id", value: planted.ssn },
    { category: "id", value: planted.account },
  ];
}

test("Maya fixture identifiers and planted identifiers are all removed", () => {
  const result = scrubText(chart(), { identifiers: identifiers(), anchorDate: maya!.anchor_date });
  const secrets = [
    maya!.name,
    "Maya",
    "Okafor",
    maya!.dob,
    maya!.mrn,
    "41 Alder Lane",
    "Fictionville",
    maya!.phone,
    maya!.email,
    maya!.insurance_id,
    planted.phone,
    planted.ssn,
    planted.account,
    "2026-10-14",
    "2026-10-28",
    planted.longDate,
    planted.usDate,
  ];
  for (const secret of secrets) {
    assert.equal(result.text.includes(secret), false, `still present: ${secret}\n${result.text}`);
  }
  assert.match(result.text, /Day 0/);
  assert.match(result.text, /Day \+14/);
  assert.match(result.text, /chest tightness/);
  assert.match(result.text, /Lisinopril/);
  assert.match(result.text, /anxiety/);
  assert.match(result.text, /LDL 168/);
});
