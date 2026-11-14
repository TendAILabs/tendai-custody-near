import assert from "node:assert/strict";
import test from "node:test";
import { GUIDE_STEPS } from "./guide.ts";
import { tourTarget, tourWhy } from "./guide-tour.ts";

test("each tour step points at a real control, and approval follows the button on screen", () => {
  assert.deepEqual(
    GUIDE_STEPS.map((step) => step.target),
    ["setup", "send", "summary", "open", "revoke", "open", "proof"],
  );
  assert.equal(tourTarget(0, { teeGreen: false, signVisible: false }), "setup");
  assert.equal(tourTarget(1, { teeGreen: false, signVisible: false }), "send");
  assert.equal(tourTarget(2, { teeGreen: false, signVisible: false }), "summary");
  assert.equal(tourTarget(2, { teeGreen: true, signVisible: false }), "approve");
  assert.equal(tourTarget(2, { teeGreen: true, signVisible: true }), "sign");
  assert.equal(tourTarget(3, { teeGreen: false, signVisible: false }), "open");
  assert.equal(tourTarget(4, { teeGreen: false, signVisible: false }), "revoke");
  assert.equal(tourTarget(4, { teeGreen: false, signVisible: true }), "sign");
  assert.equal(tourTarget(5, { teeGreen: false, signVisible: false }), "open");
  assert.equal(tourTarget(6, { teeGreen: false, signVisible: false }), "proof");
  assert.match(tourWhy(2, "sign"), /server holds her key/);
  assert.match(tourWhy(4, "sign"), /cannot erase a copy someone already downloaded/);
  assert.match(GUIDE_STEPS[0].doThis, /Use the demo server account/);
  assert.equal(GUIDE_STEPS.some((step) => step.doThis.includes(". ") && step.doThis.split(". ").length > 2), false);
});
