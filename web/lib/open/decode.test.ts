import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeEnvelopeJson } from "./decode.ts";

test("L4 bad base64 or JSON throws before an envelope is used", () => {
  assert.throws(() => decodeEnvelopeJson("@@@"));
  assert.throws(() => decodeEnvelopeJson(Buffer.from("not-json", "utf8").toString("base64")));
  const envelope = { v: 1, alg: "x25519-hkdf-sha256+xchacha20poly1305", aad: "1|artifact|v1", nonce: "aa", ciphertext: "bb", recipients: [] };
  const raw = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64");
  assert.equal(decodeEnvelopeJson(raw).aad, "1|artifact|v1");
});
