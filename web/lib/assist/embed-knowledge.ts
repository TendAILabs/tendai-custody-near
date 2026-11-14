import { readFileSync } from "node:fs";
import path from "node:path";
import { ASSIST_KNOWLEDGE, KNOWLEDGE_QUOTES } from "./knowledge.ts";

const root = path.resolve(import.meta.dirname, "../../..");

for (const quote of KNOWLEDGE_QUOTES) {
  const source = readFileSync(path.join(root, quote.file), "utf8");
  if (!source.includes(quote.text) || !ASSIST_KNOWLEDGE.includes(quote.text)) {
    throw new Error(`quote drifted: ${quote.term}`);
  }
}

if (ASSIST_KNOWLEDGE.includes("\u2014") || ASSIST_KNOWLEDGE.includes("\u2013")) throw new Error("em dash in knowledge");
if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(ASSIST_KNOWLEDGE)) throw new Error("email in knowledge");
if (/ed25519:[1-9A-HJ-NP-Za-km-z]{20,}/.test(ASSIST_KNOWLEDGE)) throw new Error("key material in knowledge");
if (/protection on/i.test(ASSIST_KNOWLEDGE)) throw new Error("protection wording in knowledge");
if (/\bHIPAA compliant\b|\baudited\b|\bcertified\b|\bvulnerability-free\b/i.test(ASSIST_KNOWLEDGE)) {
  throw new Error("forbidden claim in knowledge");
}

console.log(`knowledge quotes=${KNOWLEDGE_QUOTES.length} chars=${ASSIST_KNOWLEDGE.length}`);
