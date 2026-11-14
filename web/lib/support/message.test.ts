import assert from "node:assert/strict";
import { test } from "node:test";
import { supportMessage } from "./message.ts";

test("a newline cannot move text between subject and message", () => {
  const nonce = "ab".repeat(32);
  const split = supportMessage("create", nonce, { subject: "a\nb", message: "c" });
  const moved = supportMessage("create", nonce, { subject: "a", message: "b\nc" });
  assert.notEqual(split, moved);
  assert.equal(split.startsWith("tendai.support/v1\n"), true);
  const body = JSON.parse(split.split("\n").slice(1).join("\n")) as { domain: string; version: number; subject: string; message: string };
  assert.equal(body.domain, "tendai.support");
  assert.equal(body.version, 1);
  assert.equal(body.subject, "a\nb");
  assert.equal(body.message, "c");
});
