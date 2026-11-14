import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dayUsage, memoryStore, type HitStore } from "../guard/visitor.ts";
import { handleNearAi } from "../http/nearai-proxy.ts";
import { newVisitorSession, writeVisitorCookie } from "../session/visitor.ts";
import { ACCEPTED_SUMMARY } from "./completion.ts";
import { SUMMARY_SAFE_ERROR } from "./summary-error.ts";
import { handleTeeDeid } from "./deid-handler.ts";
import { handleTeeLive } from "./live-handler.ts";
import { handleTeeSummary, type SummaryResult } from "./summary-handler.ts";

const SECRET = "test-session-secret";
const SHARE = "1";
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const CHART = "exertional chest tightness that improves with rest";
const TOKEN = "chart-token-zz";

function cookie(shareIds: string[]): string {
  const session = newVisitorSession(NOW);
  for (const id of shareIds) session.shares.push(id);
  return writeVisitorCookie(session, SECRET, false).split(";")[0] ?? "";
}

function summaryRequest(body: string, withSession: boolean): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (withSession) headers.set("cookie", cookie([SHARE]));
  return new Request("https://demo.test/api/tee/summary", { method: "POST", headers, body });
}

function post(path: string, body?: string, headers?: Headers): Request {
  return new Request(`https://demo.test${path}`, { method: "POST", headers, body });
}

function guard(store: HitStore) {
  return { now: NOW, store, secret: SECRET, keyConfigured: true };
}

function stopped(): Promise<SummaryResult> {
  throw new Error("summarize should not run");
}

function quietFetch(): typeof fetch {
  return async () => {
    throw new Error("proxy fetch should not run");
  };
}

test("F-02 an unauthenticated summary does not consume the NEAR AI budget", async () => {
  const store = memoryStore({ isolated: true });
  let calls = 0;
  const response = await handleTeeSummary(summaryRequest(JSON.stringify({ chart: `${CHART} ${TOKEN}`, shareId: SHARE }), false), {
    ...guard(store),
    summarize: async () => {
      calls += 1;
      return stopped();
    },
  });
  const body = (await response.json()) as { error?: string };
  assert.equal(response.status, 401);
  assert.equal(body.error, "sign in required");
  assert.equal(JSON.stringify(body).includes(TOKEN), false);
  assert.equal(JSON.stringify(body).includes("NEARAI"), false);
  assert.equal(calls, 0);
  assert.equal(await dayUsage("ai", NOW, store), 0);
});

test("F-02 an invalid summary body does not consume the NEAR AI budget", async () => {
  const store = memoryStore({ isolated: true });
  let calls = 0;
  const deps = {
    ...guard(store),
    summarize: async () => {
      calls += 1;
      return stopped();
    },
  };
  const empty = await handleTeeSummary(summaryRequest(JSON.stringify({ chart: "   ", shareId: SHARE }), true), deps);
  const malformed = await handleTeeSummary(summaryRequest("not-json", true), deps);
  const emptyBody = (await empty.json()) as { error?: string };
  const malformedBody = (await malformed.json()) as { error?: string };
  assert.equal(empty.status, 400);
  assert.equal(emptyBody.error, "empty chart");
  assert.equal(malformed.status, 400);
  assert.equal(malformedBody.error, "bad request");
  assert.equal(calls, 0);
  assert.equal(await dayUsage("ai", NOW, store), 0);
});

test("F-02 a valid summary consumes exactly one NEAR AI budget unit", async () => {
  const store = memoryStore({ isolated: true });
  let calls = 0;
  const response = await handleTeeSummary(summaryRequest(JSON.stringify({ chart: CHART, shareId: SHARE }), true), {
    ...guard(store),
    summarize: async () => {
      calls += 1;
      return {
        text: ACCEPTED_SUMMARY,
        log: {
          signatureKind: "provider_tee",
          signer: "ed25519 test",
          gatewayTcb: "UpToDate",
          modelTcb: "UpToDate",
          receiptJson: JSON.stringify({ tee: true, signatureKind: "provider_tee", signer: "test", signedText: "note" }),
          latencyMs: 1,
        },
      };
    },
  });
  const body = (await response.json()) as { signatureKind?: string; error?: string };
  assert.equal(response.status, 200);
  assert.equal(body.signatureKind, "provider_tee");
  assert.equal(calls, 1);
  assert.equal(await dayUsage("ai", NOW, store), 1);
  const unauth = await handleTeeSummary(summaryRequest(JSON.stringify({ chart: CHART, shareId: SHARE }), false), {
    ...guard(store),
    summarize: async () => stopped(),
  });
  const invalid = await handleTeeSummary(summaryRequest(JSON.stringify({ chart: "" }), true), {
    ...guard(store),
    summarize: async () => stopped(),
  });
  assert.equal(unauth.status, 401);
  assert.equal(invalid.status, 400);
  assert.equal(calls, 1);
  assert.equal(await dayUsage("ai", NOW, store), 1);
});

test("F-02 a summary whose counter fails after the call keeps the rate slot", async () => {
  const store = memoryStore({ isolated: true });
  const response = await handleTeeSummary(summaryRequest(JSON.stringify({ chart: CHART, shareId: SHARE }), true), {
    ...guard(store),
    summarize: async () => {
      throw new Error("Spend counter is unavailable.");
    },
  });
  const body = (await response.json()) as { error?: string };
  assert.equal(response.status, 502);
  assert.equal(body.error, SUMMARY_SAFE_ERROR);
  assert.equal(JSON.stringify(body).includes("No request"), false);
  assert.equal(await dayUsage("ai", NOW, store), 1);
});

test("F-02 a summary that never reaches NEAR AI is refunded", async () => {
  const store = memoryStore({ isolated: true });
  const response = await handleTeeSummary(summaryRequest(JSON.stringify({ chart: CHART, shareId: SHARE }), true), {
    ...guard(store),
    summarize: async () => {
      throw new Error("Refusing model: estimated spend would pass $4. No request was sent.");
    },
  });
  const body = (await response.json()) as { error?: string };
  assert.equal(response.status, 502);
  assert.equal(body.error, SUMMARY_SAFE_ERROR);
  assert.equal(JSON.stringify(body).includes("Refusing"), false);
  assert.equal(JSON.stringify(body).includes("No request"), false);
  assert.equal(await dayUsage("ai", NOW, store), 0);
});

test("F-02 a padded share id is rejected before the summary runs", async () => {
  const store = memoryStore({ isolated: true });
  let calls = 0;
  const response = await handleTeeSummary(summaryRequest(JSON.stringify({ chart: CHART, shareId: "01" }), true), {
    ...guard(store),
    summarize: async () => {
      calls += 1;
      return stopped();
    },
  });
  const body = (await response.json()) as { error?: string };
  assert.equal(response.status, 400);
  assert.equal(body.error, "bad request");
  assert.equal(calls, 0);
  assert.equal(await dayUsage("ai", NOW, store), 0);
});

test("F-02 a summary for another session does not consume the budget", async () => {
  const store = memoryStore({ isolated: true });
  let calls = 0;
  const response = await handleTeeSummary(summaryRequest(JSON.stringify({ chart: CHART, shareId: "2" }), true), {
    ...guard(store),
    summarize: async () => {
      calls += 1;
      return stopped();
    },
  });
  const body = (await response.json()) as { error?: string };
  assert.equal(response.status, 403);
  assert.equal(body.error, "not this session");
  assert.equal(calls, 0);
  assert.equal(await dayUsage("ai", NOW, store), 0);
});

test("F-02 TEE routes return 401 without a demo session", async () => {
  const store = memoryStore({ isolated: true });
  let calls = 0;
  const summarize = async () => {
    calls += 1;
    return stopped();
  };
  const run = async () => {
    calls += 1;
    return { ok: false as const, stage: "tee" as const, reason: "should not run" };
  };
  const summary = await handleTeeSummary(summaryRequest(JSON.stringify({ chart: CHART, shareId: SHARE }), false), {
    ...guard(store),
    keyConfigured: false,
    summarize,
  });
  const live = await handleTeeLive(post("/api/tee/live"), { ...guard(store), keyConfigured: false, summarize });
  const deid = await handleTeeDeid(post("/api/tee/deid"), { ...guard(store), keyConfigured: false, run });
  const proxy = await handleNearAi(post("/api/nearai/v1/chat/completions", "{\"model\":\"z-ai/glm-5.3-flash\"}"), {
    ...guard(store),
    sessionSecret: SECRET,
    upstreamKey: "test-upstream-key",
    fetch: quietFetch(),
  });
  const gateway = await handleNearAi(
    new Request("https://demo.test/api/nearai/v1/attestation/report", { headers: { authorization: `Bearer ${SECRET}` } }),
    {
      ...guard(store),
      sessionSecret: SECRET,
      upstreamKey: "test-upstream-key",
      fetch: quietFetch(),
    },
  );
  assert.equal(summary.status, 401);
  assert.equal(live.status, 401);
  assert.equal(deid.status, 401);
  assert.equal(proxy.status, 404);
  assert.equal(gateway.status, 404);
  const deidBody = (await deid.json()) as { ok?: boolean; error?: string };
  assert.equal(deidBody.ok, false);
  assert.equal(deidBody.error, "sign in required");
  assert.equal(JSON.stringify(deidBody).includes("Maya"), false);
  assert.equal((await live.json() as { error?: string }).error, "sign in required");
  assert.equal(await proxy.text(), "not found");
  assert.equal(await gateway.text(), "not found");
  assert.equal(calls, 0);
  assert.equal(await dayUsage("ai", NOW, store), 0);
});

test("the NEAR AI proxy route is not mounted and does not accept the session secret", async () => {
  const store = memoryStore({ isolated: true });
  let calls = 0;
  const previous = process.env.DEMO_SESSION_SECRET;
  process.env.DEMO_SESSION_SECRET = SECRET;
  try {
    assert.throws(() => readFileSync(new URL("../../app/api/nearai/v1/[...path]/route.ts", import.meta.url), "utf8"));
    const response = await handleNearAi(
      post(
        "/api/nearai/v1/chat/completions",
        JSON.stringify({ model: "z-ai/glm-5.3-flash", messages: [{ role: "user", content: "fictional note" }] }),
        new Headers({ authorization: `Bearer ${SECRET}`, "content-type": "application/json" }),
      ),
      {
        ...guard(store),
        sessionSecret: SECRET,
        upstreamKey: "test-upstream-key",
        fetch: async () => {
          calls += 1;
          return new Response("{}", { status: 200 });
        },
      },
    );
    const text = await response.text();
    assert.equal(response.status, 404);
    assert.equal(text, "not found");
    assert.equal(calls, 0);
    assert.equal(await dayUsage("ai", NOW, store), 0);
    assert.equal(text.includes(SECRET), false);
  } finally {
    if (previous === undefined) delete process.env.DEMO_SESSION_SECRET;
    else process.env.DEMO_SESSION_SECRET = previous;
  }
});

test("tee routes reject a foreign origin and still accept the demo origin", async () => {
  const store = memoryStore({ isolated: true });
  let calls = 0;
  const summarize = async () => {
    calls += 1;
    return {
      text: ACCEPTED_SUMMARY,
      log: {
        signatureKind: "provider_tee",
        signer: "ed25519 test",
        gatewayTcb: "UpToDate",
        modelTcb: "UpToDate",
        receiptJson: JSON.stringify({ tee: true, signatureKind: "provider_tee", signedText: "note" }),
        latencyMs: 1,
      },
    };
  };
  const foreign = await handleTeeSummary(
    new Request("https://demo.test/api/tee/summary", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example", cookie: cookie([SHARE]) },
      body: JSON.stringify({ chart: CHART, shareId: SHARE }),
    }),
    { ...guard(store), summarize },
  );
  assert.equal(foreign.status, 403);
  const same = await handleTeeSummary(
    new Request("https://demo.test/api/tee/summary", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://demo.test", cookie: cookie([SHARE]) },
      body: JSON.stringify({ chart: CHART, shareId: SHARE }),
    }),
    { ...guard(store), summarize },
  );
  assert.equal(same.status, 200);
  const deidForeign = await handleTeeDeid(
    new Request("https://demo.test/api/tee/deid", { method: "POST", headers: { origin: "https://evil.example", cookie: cookie([]) } }),
    { ...guard(store), run: async () => { calls += 1; return { ok: false, stage: "local", reason: "should not run" }; } },
  );
  assert.equal(deidForeign.status, 403);
  const deidSame = await handleTeeDeid(
    new Request("https://demo.test/api/tee/deid", { method: "POST", headers: { origin: "https://demo.test", cookie: cookie([]) } }),
    { ...guard(store), keyConfigured: false, run: async () => { calls += 1; return { ok: false, stage: "local", reason: "should not run" }; } },
  );
  assert.equal(deidSame.status, 503);
  const liveForeign = await handleTeeLive(
    new Request("https://demo.test/api/tee/live", { method: "POST", headers: { origin: "https://evil.example" } }),
    { ...guard(store), summarize },
  );
  assert.equal(liveForeign.status, 403);
  const liveSame = await handleTeeLive(
    new Request("https://demo.test/api/tee/live", { method: "POST", headers: { origin: "https://demo.test", cookie: cookie([]) } }),
    { ...guard(store), keyConfigured: false, summarize },
  );
  assert.equal(liveSame.status, 503);
  assert.equal(calls, 1);
});

test("F-02 a de-identification pass that stays local releases the budget", async () => {
  const store = memoryStore({ isolated: true });
  const headers = new Headers({ cookie: cookie([]) });
  const response = await handleTeeDeid(post("/api/tee/deid", undefined, headers), {
    ...guard(store),
    run: async () => ({ ok: false, stage: "local", reason: "local scrub left a personal identifier" }),
  });
  assert.equal(response.status, 422);
  assert.equal(await dayUsage("ai", NOW, store), 0);
});
