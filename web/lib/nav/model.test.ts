import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ACCOUNTS, TESTNET_CONTRACT } from "../fixtures.ts";
import {
  adminDash,
  clinicDash,
  hospitalDash,
  menuFor,
  navBadge,
  patientDash,
  storyNotes,
  unreadCount,
  WHO,
  workspaceForPath,
  youAre,
  type NavStory,
} from "./model.ts";

const OLD = "rr8573fee1";

function fresh(): NavStory {
  return {
    referralSent: false,
    consentStatus: "pending",
    hospitalOpened: false,
    openCount: 0,
    consultSent: false,
    secondSent: false,
    secondOpened: false,
    secondReplySent: false,
    deidSent: false,
    deidOpened: false,
    expiryDays: 30,
    revoked: { referral: false, second: false, deid: false },
  };
}

test("fixtures no longer name the retired contract", () => {
  assert.equal(ACCOUNTS.contract, TESTNET_CONTRACT);
  assert.equal(ACCOUNTS.contract.includes(OLD), false);
  const source = readFileSync(new URL("../fixtures.ts", import.meta.url), "utf8");
  assert.equal(source.includes(OLD), false);
});

test("each role has its own short menu and one organization name", () => {
  assert.deepEqual(
    menuFor("patient", null)[0].items.map((item) => item.label),
    ["My dashboard", "Requests", "My records", "Who has access", "Share with an app", "My activity"],
  );
  assert.deepEqual(
    menuFor("clinician", "clinic")[0].items.map((item) => item.label),
    ["Clinic dashboard", "New referral", "Sent referrals"],
  );
  assert.deepEqual(
    menuFor("clinician", "hospital")[0].items.map((item) => item.label),
    ["Hospital dashboard", "Incoming referrals", "Consult reply"],
  );
  assert.deepEqual(menuFor("clinician", "reyes")[0].items.map((item) => item.label), ["Second opinions"]);
  assert.equal(menuFor("admin", null)[0].items.some((item) => item.href.startsWith("/audit")), true);
  assert.equal(menuFor("proof", null)[0].items.some((item) => item.href === "/verification"), true);
  const labels = [
    ...menuFor("patient", null),
    ...menuFor("clinician", "clinic"),
    ...menuFor("clinician", "hospital"),
    ...menuFor("admin", null),
    ...menuFor("proof", null),
  ].flatMap((group) => group.items.map((item) => item.label));
  assert.equal(labels.some((label) => label.includes("Clinic A") || label.includes("Hospital B")), false);
  assert.equal(labels.some((label) => /^\d/.test(label)), false);
  assert.equal(WHO.length, 5);
  assert.equal(workspaceForPath("/hospital/blocked")?.org, "hospital");
  const shareWithApp = menuFor("patient", null)[0].items.find((item) => item.id === "apps");
  assert.equal(shareWithApp?.label, "Share with an app");
  assert.equal(shareWithApp?.href, "/pulsefit");
  assert.equal(shareWithApp?.test("/pulsefit", "", ""), true);
  assert.equal(shareWithApp?.test("/patient/deid", "#deid-preview", ""), false);
  assert.equal(shareWithApp?.test("/patient/records", "", ""), false);
  assert.equal(workspaceForPath("/patient/deid")?.workspace, "patient");
  assert.equal(workspaceForPath("/home")?.workspace, null);
  assert.equal(workspaceForPath("/help"), null);
  assert.equal(workspaceForPath("/patient/records/r-12")?.workspace, "patient");
  assert.equal(workspaceForPath("/onchain", "?desk=proof")?.workspace, "proof");
  assert.equal(youAre("patient", null)?.includes("Maya Okafor"), true);
  assert.equal(youAre("proof", null), null);
  assert.equal(youAre(null, null), null);
});

test("home counts follow the story and empty menus do not invent activity", () => {
  const empty = patientDash(fresh(), false);
  assert.equal(empty.counts[0].value, 0);
  assert.equal(empty.nextHref, "/patient");
  const waiting = patientDash(fresh(), true);
  assert.equal(waiting.nextHref, "/clinic");
  const sent = fresh();
  sent.referralSent = true;
  const pending = patientDash(sent, true);
  assert.equal(pending.counts[0].value, 1);
  assert.equal(pending.nextHref, "/patient");
  assert.equal(clinicDash(sent).counts[0].value, 1);
  sent.consentStatus = "active";
  sent.hospitalOpened = true;
  sent.openCount = 2;
  assert.equal(patientDash(sent, true).counts[1].value, 1);
  assert.equal(hospitalDash(sent).counts[2].value, 2);
  assert.equal(navBadge("access", fresh())?.text, "-");
  assert.equal(navBadge("activity", fresh())?.text, "-");
  assert.equal(navBadge("access", sent)?.text, "1 share");
  assert.equal(navBadge("activity", sent)?.text, "On NEAR");
  assert.equal(adminDash(sent).counts[0].value, 1);
  assert.equal(adminDash(sent).counts[1].value, 2);
});

test("the bell is empty until the story moves, then tracks what was opened", () => {
  assert.deepEqual(storyNotes(fresh()), []);
  const sent = fresh();
  sent.referralSent = true;
  const notes = storyNotes({ ...sent, referralTx: "abc123def456" });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].tx, "abc123def456");
  assert.equal(storyNotes({ ...sent, referralTx: "stub-tx-referral" })[0].tx, null);
  assert.equal(unreadCount(notes, []), 1);
  assert.equal(unreadCount(notes, ["requested"]), 0);
  const expiring = fresh();
  expiring.referralSent = true;
  expiring.consentStatus = "active";
  expiring.expiryDays = 7;
  assert.equal(storyNotes(expiring).some((note) => note.id === "expiring"), true);
});

test("the stage does not keep a min-height that overflows the viewport", () => {
  const css = readFileSync(new URL("../../components/wireframe/dashboard.css", import.meta.url), "utf8");
  assert.match(css, /\.c2-stage\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(css, /\.c2-stage\s*\{[^}]*padding:\s*32px var\(--pad\) 32px/s);
  assert.match(css, /\.c2-stage\s*\{[^}]*min-height:\s*0/s);
  assert.match(css, /\.c2-stage-step\s*\{[^}]*margin-top:\s*calc\(var\(--top\) \+ var\(--step\)\)/s);
  assert.match(css, /\.c2-stage-step\s*\{[^}]*min-height:\s*0/s);
  assert.equal(css.includes("min-height: calc(100vh - var(--top) - var(--foot))"), false);
  assert.equal(css.includes("min-height: calc(100dvh - var(--top) - var(--foot))"), false);
});

test("shell copy avoids banned claims", () => {
  const files = [
    new URL("../../components/wireframe/shell.tsx", import.meta.url),
    new URL("../../components/wireframe/home-screen.tsx", import.meta.url),
    new URL("../../app/settings/page.tsx", import.meta.url),
    new URL("./model.ts", import.meta.url),
  ];
  const banned = ["HIPAA compliant", "audited", "certified", "vulnerability-free", "protection on", "\u2014"];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const word of banned) {
      assert.equal(text.toLowerCase().includes(word.toLowerCase()), false, `${file.pathname} contains ${word}`);
    }
  }
});
