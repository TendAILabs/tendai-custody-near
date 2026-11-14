// In-process race against the visitor limiter. No network. No secrets.
// Run: NODE_PATH=web/node_modules node --experimental-strip-types docs/redteam/repros/guard-race.mjs

import { admit, memoryStore, AI_DAY_LIMIT } from "../../../web/lib/guard/visitor.ts";

const store = memoryStore();
const now = Date.UTC(2026, 10, 11, 3, 0, 0);
const n = 400;
const results = await Promise.all(
  Array.from({ length: n }, (_, i) => admit({ ip: `203.0.113.${i % 200}`, kind: "ai", now: now + (i % 50), store })),
);
const passed = results.filter((result) => result.ok).length;
let follow = 0;
for (let i = 0; i < 20; i += 1) {
  const result = await admit({ ip: `198.51.100.${i + 1}`, kind: "ai", now: now + 1000 + i, store });
  if (!result.ok) break;
  follow += 1;
}
console.log(
  JSON.stringify({
    concurrent: n,
    passed,
    blocked: n - passed,
    dayLimit: AI_DAY_LIMIT,
    overshoot: passed > AI_DAY_LIMIT,
    sequentialFollowUpsThatStillPassed: follow,
  }),
);
