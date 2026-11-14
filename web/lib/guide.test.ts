import assert from "node:assert/strict";
import { test } from "node:test";
import { GUIDE_EXTRAS, GUIDE_STEPS, guideComplete, guideCurrent, guideDeclined, guideDone, onGuidePage } from "./guide.ts";
import type { Story } from "./story.ts";

function story(over: Partial<Story> = {}): Story {
  return {
    referralSent: false,
    consentStatus: "pending",
    hospitalOpened: false,
    blockedAttempt: false,
    proofSeen: false,
    revoked: { referral: false, second: false, deid: false },
    ...over,
    revoked: { referral: false, second: false, deid: false, ...(over.revoked ?? {}) },
  } as Story;
}

test("the guide is seven real steps and ends on the proof", () => {
  assert.equal(GUIDE_STEPS.length, 7);
  assert.deepEqual(
    GUIDE_STEPS.map((step) => step.n),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(GUIDE_STEPS[0].href, "/patient");
  assert.match(GUIDE_STEPS[0].doThis, /Use the demo server account/);
  assert.match(GUIDE_STEPS[2].doThis, /Check with secure AI/);
  assert.match(GUIDE_STEPS[2].doThis, /Approve and share/);
  assert.equal(/^[a-z]/.test(GUIDE_STEPS[0].doThis), false);
  assert.equal(GUIDE_STEPS[1].href, "/clinic");
  assert.equal(GUIDE_STEPS[3].actor, "St. Aster Hospital");
  assert.equal(GUIDE_STEPS[4].href, "/patient/sharing");
  assert.equal(GUIDE_STEPS[5].href, "/hospital");
  assert.equal(GUIDE_STEPS[6].href.startsWith("/onchain"), true);
  assert.equal(GUIDE_STEPS.some((step) => step.label.includes("Clinic A") || step.label.includes("Hospital B")), false);
  assert.equal(GUIDE_EXTRAS.length, 2);
  assert.equal(GUIDE_EXTRAS[0].href, "/patient#second-opinion");
});

test("steps advance only when the real action has happened", () => {
  const fresh = story();
  assert.deepEqual(guideDone(fresh, false), [false, false, false, false, false, false, false]);
  assert.equal(guideCurrent(fresh, false), 0);
  assert.equal(guideCurrent(fresh, true), 1);

  const sent = story();
  sent.referralSent = true;
  assert.equal(guideCurrent(sent, true), 2);

  const approved = story();
  approved.referralSent = true;
  approved.consentStatus = "active";
  assert.equal(guideCurrent(approved, true), 3);

  const opened = story();
  opened.referralSent = true;
  opened.consentStatus = "active";
  opened.hospitalOpened = true;
  assert.equal(guideCurrent(opened, true), 4);

  const revoked = story();
  revoked.referralSent = true;
  revoked.consentStatus = "active";
  revoked.hospitalOpened = true;
  revoked.revoked.referral = true;
  assert.equal(guideCurrent(revoked, true), 5);

  const refused = story();
  refused.referralSent = true;
  refused.consentStatus = "active";
  refused.hospitalOpened = true;
  refused.revoked.referral = true;
  refused.blockedAttempt = true;
  assert.equal(guideCurrent(refused, true), 6);
  assert.equal(guideComplete(refused, true), false);

  refused.proofSeen = true;
  assert.equal(guideComplete(refused, true), true);
  assert.equal(guideCurrent(refused, true), 6);
});

test("a decline stays on Maya's approval step", () => {
  const declined = story();
  declined.referralSent = true;
  declined.consentStatus = "declined";
  assert.equal(guideCurrent(declined, true), 2);
  assert.equal(guideDeclined(declined, true), true);
  assert.equal(guideComplete(declined, true), false);
});

test("the guide page check does not treat later patient pages as the request step", () => {
  assert.equal(onGuidePage("/patient", "/patient"), true);
  assert.equal(onGuidePage("/patient/sharing", "/patient"), false);
  assert.equal(onGuidePage("/patient/sharing", "/patient/sharing"), true);
  assert.equal(onGuidePage("/hospital/blocked", "/hospital"), true);
  assert.equal(onGuidePage("/onchain", "/onchain?desk=proof"), true);
  assert.equal(onGuidePage("/clinic", "/patient"), false);
});
