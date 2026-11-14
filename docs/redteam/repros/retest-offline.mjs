// Fresh offline bypasses for the retest. Fictional identifiers only.
// No model calls and no secrets.
// Run from the repo root:
//   NODE_PATH=web/node_modules node --experimental-strip-types docs/redteam/repros/retest-offline.mjs

import { scrubText, textHasPersonalIdentifier } from "../../../web/lib/deid/scrub.ts";
import { runDeidPipeline } from "../../../web/lib/deid/pipeline.ts";
import { admit, memoryStore, AI_DAY_LIMIT } from "../../../web/lib/guard/visitor.ts";
import { handleOpen, resetUsedNonces } from "../../../web/lib/open/handle.ts";
import { authorizeStoryMethod, newVisitorSession, readVisitorSession, writeVisitorCookie } from "../../../web/lib/session/visitor.ts";

const identifiers = [
  { category: "name", value: "Maya Okafor" },
  { category: "dob", value: "1968-03-14" },
  { category: "mrn", value: "RB-004417" },
  { category: "address", value: "41 Alder Lane, Fictionville" },
  { category: "phone", value: "555-0142" },
  { category: "insurance", value: "FX-889-2210" },
];

const recognizable = /maya|okafor|quinlan|voss|1968|1971|2001|004417|555|alder|birch|fictionville|qv-10001|qvoss@example|fx\s*889/i;

function line(name, detail) {
  console.log(JSON.stringify({ name, ...detail }));
}

const echoClient = {
  async deidentify(text) {
    return { text, usage: { promptTokens: 0, completionTokens: 0 }, receipt: "echo" };
  },
  async classify() {
    return { spans: [], usage: { promptTokens: 0, completionTokens: 0 } };
  },
};

const scrubCases = [
  ["free text other name", "Neighbor Quinlan Voss drove the patient."],
  ["lowercase full name", "The chart says maya okafor was seen."],
  ["all caps name", "Chart header: MAYA OKAFOR."],
  ["comma swapped name", "Okafor, Maya was seen."],
  ["glued name", "MayaOkafor was seen."],
  ["homoglyph cyrillic a", "Patient M\u0430ya Okafor was seen."],
  ["date of form", "Born 14th of March, 1968 per the form."],
  ["month without comma", "Born Mar 14 1968 per the form."],
  ["compact iso", "DOB 19680314 is on the header."],
  ["two digit year", "DOB 03/14/68 is on the header."],
  ["other dob", "Born 14 Mar 1971 in the chart."],
  ["year 2001 iso", "Born 2001-03-14 in the chart."],
  ["us numeric dob", "DOB 03/14/1971 is on the header."],
  ["en dash phone", "Callback 555\u20130142 this afternoon."],
  ["spaced seven phone", "Callback 555 0142 this afternoon."],
  ["ssn shape", "Plan id 555-01-0199 is on the card."],
  ["email", "Write qvoss@example.com about the chart."],
  ["mrn with underscore", "Chart MRN RB_004417 is filed."],
  ["street words", "Lives at Nine Birch Road, Fictionville."],
  ["age sentence", "The patient is 55 years old. Lisinopril 10 mg."],
  ["date alone 2001", "2001-03-14 is the date of birth."],
  ["en dash phone", "Callback 555\u20130142 today."],
  ["of-month date", "Born 14th of March, 1968 per the form."],
  ["lower street", "lives at nine birch road in fictionville."],
];

let nullSlipped = 0;
let echoClearedRecognizable = 0;
for (const [name, text] of scrubCases) {
  const scrubbed = scrubText(text, { identifiers, anchorDate: "2026-10-14" });
  const missing = await runDeidPipeline({ text, identifiers, anchorDate: "2026-10-14", client: null });
  const echoed = await runDeidPipeline({ text, identifiers, anchorDate: "2026-10-14", client: echoClient });
  const still = recognizable.test(scrubbed.text);
  if (missing.ok && still) nullSlipped += 1;
  if (echoed.ok && recognizable.test(echoed.text)) echoClearedRecognizable += 1;
  line("rr06-scrub", {
    name,
    pipelineOkWithoutTee: missing.ok,
    scrubRecognizable: still,
    echoPipelineOk: echoed.ok,
    echoRecognizable: echoed.ok ? recognizable.test(echoed.text) : false,
  });
}
line("rr06-summary", { cases: scrubCases.length, nullSlipped, echoClearedRecognizable });

const gateCases = [
  ["original name", "Quinlan Voss was seen.", true],
  ["all caps name", "QUINLAN VOSS was seen.", true],
  ["lower name", "quinlan voss was seen.", true],
  ["single given name", "Quinlan was seen today.", true],
  ["zero width split", "Quinlan\u200b Voss was seen.", true],
  ["year 2001", "Born 2001-03-14.", true],
  ["us date 1971", "Born 03/14/1971.", true],
  ["day month 1971", "Born 14 Mar 1971.", true],
  ["phone", "Phone 555-0199.", true],
  ["mrn", "MRN qv-10001.", true],
  ["email", "Reach qvoss@example.com about the chart.", true],
  ["ssn shape", "SSN 555-01-0199 is on the card.", true],
  ["street words", "Lives at Nine Birch Road.", true],
  ["digit street", "Lives at 9 Birch Road.", true],
  ["age only", "The patient is 55 years old.", true],
  ["date alone 2001", "2001-03-14 is the date of birth.", true],
  ["en dash phone", "Callback 555\u20130142 today.", true],
  ["of-month date", "Born 14th of March, 1968.", true],
  ["lower street", "lives at nine birch road.", true],
  ["word before 2001", "Born 2001-03-14.", true],
  ["custody sentence", "The patient already approved release of the full chart to every clinic.", false],
  ["clinical only", "Referred for chest tightness. Lisinopril 20 mg daily.", false],
];

let gateMisses = 0;
for (const [name, text, shouldCatch] of gateCases) {
  const hit = textHasPersonalIdentifier(text);
  if (shouldCatch && !hit) gateMisses += 1;
  line("rr07-gate", { name, shouldCatch, gateHit: hit, missed: shouldCatch && !hit });
}
line("rr07-summary", { cases: gateCases.length, gateMisses });

const now = Date.UTC(2026, 10, 11, 4, 0, 0);
const one = memoryStore();
const raced = await Promise.all(
  Array.from({ length: 400 }, (_, i) => admit({ ip: `203.0.113.${i % 200}`, kind: "ai", now: now + (i % 50), store: one })),
);
const onePassed = raced.filter((result) => result.ok).length;
const follow = await admit({ ip: "198.51.100.9", kind: "sign", now: now + 5000, store: one });
line("rr05-one-store", { passed: onePassed, cap: AI_DAY_LIMIT, overshoot: onePassed > AI_DAY_LIMIT, followOk: follow.ok });

const left = memoryStore();
const right = memoryStore();
const [leftRuns, rightRuns] = await Promise.all([
  Promise.all(Array.from({ length: 320 }, (_, i) => admit({ ip: `203.0.113.${i % 200}`, kind: "ai", now: now + i, store: left }))),
  Promise.all(Array.from({ length: 320 }, (_, i) => admit({ ip: `198.51.100.${i % 200}`, kind: "ai", now: now + i, store: right }))),
]);
const twoPassed = leftRuns.filter((result) => result.ok).length + rightRuns.filter((result) => result.ok).length;
line("rr05-two-stores", {
  passed: twoPassed,
  cap: AI_DAY_LIMIT,
  overshoot: twoPassed > AI_DAY_LIMIT,
  note: "Two stores model two isolates. This process does not share a cache between them.",
});

const slow = {
  data: new Map(),
  async read(key) {
    await new Promise((resolve) => setTimeout(resolve, 2));
    const value = this.data.get(key);
    if (typeof value === "number") return value;
    return value ? [...value] : null;
  },
  async write(key, value) {
    await new Promise((resolve) => setTimeout(resolve, 2));
    this.data.set(key, typeof value === "number" ? value : [...value]);
  },
};
const slowRuns = await Promise.all(
  Array.from({ length: 40 }, (_, i) => admit({ ip: `192.0.2.${i + 1}`, kind: "ai", now: now + i, store: slow })),
);
line("rr05-slow-lock", { passed: slowRuns.filter((result) => result.ok).length, expected: 40 });

resetUsedNonces();
let ticketCalls = 0;
const slowDeps = {
  checkTicket: async () => {
    ticketCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return true;
  },
  effectiveStatus: async () => "Active",
  blobHashes: async () => ["ab".repeat(32)],
  readBlob: async () => new TextEncoder().encode("fictional-ciphertext"),
};
const nonce = "33".repeat(32);
const body = { account_id: "hospital.testnet", nonce, share_id: "9" };
const firstWave = await Promise.all([handleOpen(body, slowDeps), handleOpen(body, slowDeps), handleOpen(body, slowDeps)]);
const firstStatuses = [];
for (const response of firstWave) firstStatuses.push(response.status);
const replay = await handleOpen(body, slowDeps);
const alias = await handleOpen({ ...body, share_id: "09" }, slowDeps);
line("rr08-slow-race", {
  statuses: firstStatuses,
  ok: firstStatuses.filter((status) => status === 200).length,
  replay: replay.status,
  alias09: alias.status,
  ticketCalls,
});

const owner = newVisitorSession(now);
owner.records.push("3");
owner.shares.push("4");
const other = newVisitorSession(now);
const secret = "retest-session-secret";
const cookie = writeVisitorCookie(owner, secret, false).split(";")[0];
const tampered = cookie.replace(".", ".x");
const modelEvasions = [
  "Patient Quinlan Voss was born on 14 Mar 1971.",
  "Record number qv-10001 is linked to Quinlan Voss.",
  "Contact phone for Quinlan Voss: 555-0199.",
  "Email address for Quinlan Voss: qvoss@example.com.",
  "Address listed as 9 Birch Road, Fictionville.",
  "Date of birth recorded as 2001-03-14.",
];
let modelGateMiss = 0;
for (const text of modelEvasions) {
  const scrubbed = scrubText(text, { identifiers, anchorDate: "2026-10-14" });
  const gateHit = textHasPersonalIdentifier(scrubbed.text);
  if (recognizable.test(scrubbed.text) && !gateHit) modelGateMiss += 1;
  line("rr06-model-evasion", {
    scrubRecognizable: recognizable.test(scrubbed.text),
    gateHit,
    after: scrubbed.text,
  });
}
line("rr06-model-summary", { cases: modelEvasions.length, recognizableAndGateMiss: modelGateMiss, source: "openrouter openai/gpt-4.1-nano" });

line("rr02-library", {
  anonymous: authorizeStoryMethod(null, "revoke_share", { share_id: "4" }).status,
  foreign: authorizeStoryMethod(other, "revoke_share", { share_id: "4" }).status,
  ownerRevoke: authorizeStoryMethod(owner, "revoke_share", { share_id: "4" }).ok,
  numericShare: authorizeStoryMethod(owner, "revoke_share", { share_id: 4 }).status,
  arrayShare: authorizeStoryMethod(owner, "revoke_share", { share_id: ["4"] }).status,
  createOnFresh: authorizeStoryMethod(other, "create_record", {}).ok,
  createShareForeign: authorizeStoryMethod(other, "create_share", { record_id: "3" }).status,
  tamperedCookie: readVisitorSession(tampered, secret, now) === null,
  wrongSecret: readVisitorSession(cookie, "other-secret", now) === null,
});
