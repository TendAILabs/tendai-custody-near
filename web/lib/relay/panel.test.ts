import assert from "node:assert/strict";
import { test } from "node:test";
import { deidSendAllowed, verifiedPanelTone } from "./panel.ts";

test("the Verified panel is red when verification throws", () => {
  assert.equal(verifiedPanelTone({ threw: true, signatureKind: "provider_tee" }), "red");
  assert.equal(verifiedPanelTone({ signatureKind: "gateway" }), "red");
  assert.equal(verifiedPanelTone({ signatureKind: "provider_tee" }), "green");
});

test("a planted identifier left after the scrub blocks the app share", () => {
  assert.equal(
    deidSendAllowed({ scrubbed: "Maya Okafor has tightness.", identifiers: ["Maya Okafor"], spans: [] }),
    false,
  );
  assert.equal(
    deidSendAllowed({
      scrubbed: "The patient has tightness.",
      identifiers: ["Maya Okafor"],
      spans: [{ score: 0.5 }],
    }),
    false,
  );
  assert.equal(
    deidSendAllowed({ scrubbed: "The patient has tightness.", identifiers: ["Maya Okafor"], spans: [] }),
    true,
  );
});
