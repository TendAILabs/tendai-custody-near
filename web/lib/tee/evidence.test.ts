import assert from "node:assert/strict";
import { test } from "node:test";
import { evidencePhrase, evidencePresent, readTeeEvidence } from "./evidence.ts";

test("server evidence keeps public fields and drops secrets or missing checks", () => {
  const evidence = readTeeEvidence({
    gatewayTcb: "UpToDate",
    gatewaySigner: "ed25519 fictional-gateway",
    gatewayTls: "none",
    modelTcb: "UpToDate",
    modelGpu: "not_provided",
    modelSigner: "ed25519 fictional-model",
    chart: "Maya Okafor chest pain",
    privateKey: "ed25519:secret",
  });
  assert.equal(evidence?.gatewayTcb, "UpToDate");
  assert.equal(evidence?.gatewaySigner, "ed25519 fictional-gateway");
  assert.equal(evidencePresent(evidence?.gatewayTls), null);
  assert.equal(evidencePresent(evidence?.modelGpu), null);
  assert.equal(JSON.stringify(evidence).includes("Maya"), false);
  assert.equal(JSON.stringify(evidence).includes("secret"), false);
  assert.match(evidencePhrase("Gateway TCB", evidence?.gatewayTcb), /verified by our server via the NEAR AI SDK at call time/);
  assert.match(evidencePhrase("Model GPU", evidence?.modelGpu), /Not checked/);
  assert.equal(readTeeEvidence({ gatewaySigner: "BEGIN PRIVATE KEY" }), null);
});
