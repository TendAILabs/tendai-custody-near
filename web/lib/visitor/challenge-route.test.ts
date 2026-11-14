import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../../app/api/visitor/challenge/route.ts";

const ORIGIN = "https://demo.example";
const SECRET = "test-session-secret";

function restore(name: "VERCEL" | "DEMO_CANONICAL_ORIGIN" | "DEMO_SESSION_SECRET", previous: string | undefined) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test("production visitor challenge accepts a canonical POST and does not issue on GET", async () => {
  const previousVercel = process.env.VERCEL;
  const previousOrigin = process.env.DEMO_CANONICAL_ORIGIN;
  const previousSecret = process.env.DEMO_SESSION_SECRET;
  process.env.VERCEL = "1";
  process.env.DEMO_CANONICAL_ORIGIN = ORIGIN;
  process.env.DEMO_SESSION_SECRET = SECRET;
  const ready = async () => {};
  try {
    const issued = await POST(
      new Request(`${ORIGIN}/api/visitor/challenge`, {
        method: "POST",
        headers: { origin: ORIGIN },
      }),
      { ready },
    );
    assert.equal(issued.status, 200);
    assert.equal(issued.headers.get("cache-control"), "no-store");
    assert.equal(issued.headers.has("set-cookie"), true);
    const body = (await issued.json()) as { nonce?: string; recipient?: string };
    assert.equal(typeof body.nonce, "string");
    assert.equal((body.nonce ?? "").length > 0, true);
    assert.equal(body.recipient, ORIGIN);

    const missing = await POST(new Request(`${ORIGIN}/api/visitor/challenge`, { method: "POST" }), { ready });
    assert.equal(missing.status, 403);
    assert.equal(missing.headers.get("cache-control"), "no-store");
    assert.equal(missing.headers.get("set-cookie"), null);
    const missingBody = (await missing.json()) as { error?: string; nonce?: string };
    assert.equal(missingBody.error, "bad origin");
    assert.equal(missingBody.nonce, undefined);

    const foreign = await POST(
      new Request(`${ORIGIN}/api/visitor/challenge`, {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
      { ready },
    );
    assert.equal(foreign.status, 403);
    assert.equal(foreign.headers.get("cache-control"), "no-store");
    assert.equal(foreign.headers.get("set-cookie"), null);
    const foreignBody = (await foreign.json()) as { error?: string; nonce?: string };
    assert.equal(foreignBody.error, "bad origin");
    assert.equal(foreignBody.nonce, undefined);

    const get = await GET(
      new Request(`${ORIGIN}/api/visitor/challenge`, {
        headers: { origin: ORIGIN },
      }),
      { ready },
    );
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
    assert.equal(get.headers.get("cache-control"), "no-store");
    assert.equal(get.headers.get("set-cookie"), null);
    const getBody = (await get.json()) as { error?: string; nonce?: string };
    assert.equal(getBody.error, "method not allowed");
    assert.equal(getBody.nonce, undefined);
  } finally {
    restore("VERCEL", previousVercel);
    restore("DEMO_CANONICAL_ORIGIN", previousOrigin);
    restore("DEMO_SESSION_SECRET", previousSecret);
  }
});
