import assert from "node:assert/strict";
import { test } from "node:test";
import { assistHasPersonalIdentifier } from "./demo-names.ts";

test("the demo cast is allowed and other identifiers are not", () => {
  assert.equal(assistHasPersonalIdentifier("What does Maya approve before St. Aster Hospital can open the chart?"), false);
  assert.equal(assistHasPersonalIdentifier("Dr. Lena Park at Riverbend Family Clinic sends the referral."), false);
  assert.equal(assistHasPersonalIdentifier("Dr. Sofia Reyes at Northgate Heart Institute is a second opinion."), false);
  assert.equal(assistHasPersonalIdentifier("PulseFit receives a copy only if Maya sends one."), false);
  assert.equal(assistHasPersonalIdentifier("Please look up Quinlan Voss."), true);
  assert.equal(assistHasPersonalIdentifier("Call Jane Doe at 555-0199."), true);
  assert.equal(assistHasPersonalIdentifier("The address is 41 Alder Lane."), true);
});

test("ordinary clinical sentences pass and real identifiers do not", () => {
  for (const sentence of ["Patient is stable", "The patient was discharged yesterday", "Patient remains alert"]) {
    assert.equal(assistHasPersonalIdentifier(sentence), false, sentence);
  }
  assert.equal(assistHasPersonalIdentifier("patient sam lee"), true);
  assert.equal(assistHasPersonalIdentifier("Patient Jane Doe arrived"), true);
  assert.equal(assistHasPersonalIdentifier("DOB 14 March 1984"), true);
  assert.equal(assistHasPersonalIdentifier("MRN 1234567"), true);
  assert.equal(assistHasPersonalIdentifier("Call 555-0148 tonight"), true);
  assert.equal(assistHasPersonalIdentifier("The address is 18 Birch Road"), true);
});
