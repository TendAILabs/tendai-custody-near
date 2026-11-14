import { CLAIM_REFUSAL, MEDICAL_REFUSAL, PROMPT_MARKER, PROMPT_REFUSAL } from "./copy.ts";

const THINKING_KEYS = new Set([
  "reasoning",
  "reasoning_content",
  "reasoning_details",
  "reasoning_tokens",
  "thinking",
  "thought",
  "thoughts",
]);

const MEDICAL_ASK = [
  /\bdiagnos(?:e|is|es|ing)\b/i,
  /\bwhat(?:'s| is) wrong with me\b/i,
  /\bshould i take\b/i,
  /\binterpret (?:my|these|this)\b/i,
  /\bwhat do(?:es)? (?:my|this|these) (?:lab|result|a1c|ldl|bp|blood|chart|test)/i,
  /\bis (?:this|it) cancer\b/i,
  /\bmedical advice\b/i,
  /\bprescri(?:be|ption)\b/i,
  /\bdosage for me\b/i,
  /\bam i (?:sick|dying|ill)\b/i,
  /\bwhat (?:medication|medicine) should\b/i,
  /\bhow much\b[\s\S]{0,40}\btake\b/i,
  /\bmetformin\b/i,
  /\b\d+\s*mg\b/i,
];

const DOSE_COUNT = "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten)";
const DOSE_UNIT = "(?:tablets?|pills?|mg)";
const DOSE_WHEN = "(?:every|daily|morning)";

const MEDICAL_OUT = [
  /\byou should take\b/i,
  /\byou should start\b/i,
  /\bi recommend (?:you|taking|starting)\b/i,
  /\byour diagnosis\b/i,
  /\byour results (?:show|mean|indicate)\b/i,
  /\bthis means you have\b/i,
  /\bincrease (?:the |your )?dose\b/i,
  /\bcall (?:your|a) doctor\b/i,
  /\btake\s+\d+\s*mg\b/i,
  /\b\d+\s*mg\s+of\s+[a-z]/i,
  new RegExp(`\\b${DOSE_COUNT}\\s*${DOSE_UNIT}\\b[\\s\\S]{0,48}\\b${DOSE_WHEN}\\b`, "i"),
  new RegExp(`\\b${DOSE_WHEN}\\b[\\s\\S]{0,48}\\b${DOSE_COUNT}\\s*${DOSE_UNIT}\\b`, "i"),
  /\btake\b[\s\S]{0,48}\btablets?\b/i,
  /\btake\b[\s\S]{0,48}\bpills?\b/i,
  /\bmetformin\b/i,
];

const INJECTION = [
  /\bignore (?:all |any )?(?:previous|prior|above) (?:instructions|rules)\b/i,
  /\b(?:reveal|print|show|repeat|dump) (?:the |your )?(?:system )?prompt\b/i,
  /\b(?:reveal|print|show) (?:the |your )?(?:api |secret )?key\b/i,
  /\bNEARAI_API_KEY\b/,
  /\bsystem prompt\b/i,
  /\bdisregard\b[\s\S]{0,80}\b(?:instructions|rules|told)\b/i,
  /\binitial instructions\b/i,
  /\brules you were given\b/i,
  /\boutput your\b[\s\S]{0,40}\binstructions\b/i,
];

const SECRET_VALUE = [
  /\b(?:NEARAI_API_KEY|SUPPORT_ADMIN_ACCOUNT_ID)\b/,
  /\b(?:the|your) hmac keys?\b/i,
  /\b(?:reveal|print|dump|show me the|give me the|tell me the)\b[\s\S]{0,48}\b(?:keys?|secrets?|tokens?)\b/i,
];

function isExplanatoryAsk(text: string): boolean {
  return /\b(?:how|who|where)\b/i.test(text) || /\bwhat(?:'s| is)\b/i.test(text) || /\btell me about\b/i.test(text);
}

/** A request for a secret value. How, who, where, and what-is questions stay open. */
export function asksForSecretValue(text: string): boolean {
  if (/\b(?:NEARAI_API_KEY|SUPPORT_ADMIN_ACCOUNT_ID)\b/.test(text)) return true;
  if (isExplanatoryAsk(text)) return false;
  return SECRET_VALUE.slice(1).some((pattern) => pattern.test(text));
}

export function asksForMedicalAdvice(text: string): boolean {
  return MEDICAL_ASK.some((pattern) => pattern.test(text));
}

export function asksToBreakRules(text: string): boolean {
  return INJECTION.some((pattern) => pattern.test(text)) || asksForSecretValue(text);
}

export function stripThinkTags(text: string): string {
  return text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, " ").replace(/[ \t]+\n/g, "\n").trim();
}

export function stripThinkingFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripThinkingFields);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (THINKING_KEYS.has(key)) continue;
    out[key] = stripThinkingFields(item);
  }
  return out;
}

function leetLower(piece: string): string {
  return piece
    .toLowerCase()
    .replace(/1/g, "i")
    .replace(/0/g, "o")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function isDroppedMark(code: number): boolean {
  return (code >= 0x200b && code <= 0x200d) || code === 0x2060 || code === 0xfeff || code === 0x00ad;
}

function isMappedDash(code: number): boolean {
  return code === 0x2010 || code === 0x2011 || code === 0x2012 || code === 0x2013 || code === 0x2014 || code === 0x2015 || code === 0x2212;
}

const LOOKALIKE: Record<number, string> = {
  0x0391: "a",
  0x03b1: "a",
  0x0410: "a",
  0x0430: "a",
  0x0392: "b",
  0x03b2: "b",
  0x0412: "b",
  0x0432: "b",
  0x03f2: "c",
  0x03f9: "c",
  0x0421: "c",
  0x0441: "c",
  0x0500: "d",
  0x0501: "d",
  0x0395: "e",
  0x03b5: "e",
  0x0415: "e",
  0x0435: "e",
  0x0397: "h",
  0x03b7: "h",
  0x041d: "h",
  0x043d: "h",
  0x0399: "i",
  0x03b9: "i",
  0x0406: "i",
  0x0456: "i",
  0x0408: "j",
  0x0458: "j",
  0x039a: "k",
  0x03ba: "k",
  0x041a: "k",
  0x043a: "k",
  0x04c0: "l",
  0x04cf: "l",
  0x039c: "m",
  0x03bc: "m",
  0x041c: "m",
  0x043c: "m",
  0x039d: "n",
  0x041e: "o",
  0x043e: "o",
  0x039f: "o",
  0x03bf: "o",
  0x03a1: "p",
  0x03c1: "p",
  0x0420: "p",
  0x0440: "p",
  0x0405: "s",
  0x0455: "s",
  0x03a4: "t",
  0x03c4: "t",
  0x0422: "t",
  0x0442: "t",
  0x03c5: "u",
  0x03bd: "v",
  0x03a7: "x",
  0x03c7: "x",
  0x0425: "x",
  0x0445: "x",
  0x03a5: "y",
  0x0423: "y",
  0x0443: "y",
};

function latinLookalike(code: number): string | null {
  return LOOKALIKE[code] ?? null;
}

type Folded = { text: string; map: number[] };

function foldMapped(text: string): Folded {
  let out = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; ) {
    const code = text.codePointAt(i);
    if (code === undefined) break;
    const raw = String.fromCodePoint(code);
    const next = i + raw.length;
    if (isDroppedMark(code)) {
      i = next;
      continue;
    }
    const lookalike = latinLookalike(code);
    const piece = leetLower(lookalike ?? (isMappedDash(code) ? "-" : raw.normalize("NFKC")));
    for (let k = 0; k < piece.length; k += 1) {
      out += piece[k] ?? "";
      map.push(i);
    }
    i = next;
  }
  return { text: out, map };
}

function foldCompliance(text: string): string {
  return foldMapped(text).text;
}

function flexWord(word: string): string {
  return word.split("").join("[-\\s]?");
}

const ATTESTED = flexWord("attested");
const ATTEST_GAP = "(?:[-\\s]+[a-z0-9]+){0,2}[-\\s]+";
const ATTEST_TARGET = `(?:${flexWord("compliant")}|${flexWord("compliance")}|${flexWord("certified")}|${flexWord("certification")}|${flexWord("hipaa")}|${flexWord("soc")}[-\\s]?2)`;
const COMPLIANCE_ATTESTED = `(?:\\b${ATTESTED}${ATTEST_GAP}${ATTEST_TARGET}\\b|\\b${ATTEST_TARGET}${ATTEST_GAP}${ATTESTED}\\b)`;
const BANNED_PHRASE = [
  `\\b${flexWord("hipaa")}[-\\s]*${flexWord("compliant")}\\b`,
  `\\b${flexWord("hipaa")}[-\\s]*${flexWord("requirement")}s?\\b`,
  `\\b${flexWord("compl")}(?:y|ies|iance)\\b[\\s\\S]{0,48}\\b${flexWord("hipaa")}\\b`,
  `\\b${flexWord("hipaa")}\\b[\\s\\S]{0,48}\\b${flexWord("compl")}(?:y|ies|iance)\\b`,
  `\\b${flexWord("audit")}(?:[-\\s]?${flexWord("ed")})?\\b`,
  `\\bsecurity[-\\s]+${flexWord("audit")}\\b`,
  `\\b${flexWord("soc")}[-\\s]?2\\b`,
  `\\b${flexWord("certified")}\\b`,
  COMPLIANCE_ATTESTED,
  `\\b${flexWord("vulnerability")}[-\\s]*${flexWord("free")}\\b`,
  `\\bno[-\\s]+${flexWord("vulnerabilit")}(?:y|ies)\\b`,
].join("|");
const NEGATED_LABEL = "that label";
const IDIOM = /\b(?:no doubt|not only|without a doubt|dont worry|no question|never had|refuse to hide|cant stress)\b/;
const GOVERN = [
  /(?:^| )(?:cant|cannot) say(?: [a-z0-9]+){0,3}$/,
  /(?:^| )(?:cant|cannot) claim(?: [a-z0-9]+){0,3}$/,
  /(?:^| )never call it$/,
  /(?:^| )(?:not|isnt|arent|wasnt|werent)$/,
];

type PhraseSpan = { start: number; end: number };

function bannedSpans(folded: string): PhraseSpan[] {
  const spans: PhraseSpan[] = [];
  for (const match of folded.matchAll(new RegExp(BANNED_PHRASE, "g"))) {
    if (match.index === undefined) continue;
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function clauseTokens(folded: string, start: number): string[] {
  const window = folded.slice(Math.max(0, start - 96), start);
  let cut = -1;
  for (const mark of [".", "!", "?", "\n", ";", ":", "\u2014"]) {
    cut = Math.max(cut, window.lastIndexOf(mark));
  }
  const clause = cut === -1 ? window : window.slice(cut + 1);
  return clause
    .replace(/[\u2019\u2018]/g, "'")
    .split(/[^a-z0-9']+/)
    .filter(Boolean)
    .map((token) => token.replace(/'/g, ""));
}

function withoutIdioms(tokens: string[]): string[] {
  return tokens.join(" ").replace(new RegExp(IDIOM.source, "g"), " ").split(/\s+/).filter(Boolean);
}

const PHRASE_NEGATORS = [
  ["cant", "say"],
  ["cannot", "say"],
  ["cant", "claim"],
  ["cannot", "claim"],
  ["never", "call", "it"],
];
const WORD_NEGATORS = new Set(["not", "isnt", "arent", "wasnt", "werent"]);
const BLOCKS_GOVERN = new Set(["but", "enough", "except"]);

function findNegators(tokens: string[]): PhraseSpan[] {
  const hits: PhraseSpan[] = [];
  let index = 0;
  while (index < tokens.length) {
    const phrase = PHRASE_NEGATORS.find((item) => item.every((token, offset) => tokens[index + offset] === token));
    if (phrase) {
      hits.push({ start: index, end: index + phrase.length });
      index += phrase.length;
      continue;
    }
    if (WORD_NEGATORS.has(tokens[index] ?? "")) hits.push({ start: index, end: index + 1 });
    index += 1;
  }
  return hits;
}

function mentionIsNegated(folded: string, start: number): boolean {
  const tokens = withoutIdioms(clauseTokens(folded, start));
  const hits = findNegators(tokens);
  if (hits.length !== 1) return false;
  const hit = hits[0];
  if (!hit) return false;
  const between = tokens.slice(hit.end);
  if (between.length > 3 || between.some((token) => BLOCKS_GOVERN.has(token))) return false;
  return GOVERN.some((pattern) => pattern.test(tokens.slice(hit.start).join(" ")));
}

function assertsBannedClaim(text: string): boolean {
  const folded = foldCompliance(text);
  return bannedSpans(folded).some((span) => !mentionIsNegated(folded, span.start));
}

function bannedPhraseRemains(text: string): boolean {
  return new RegExp(BANNED_PHRASE).test(foldCompliance(text));
}

function originalRange(text: string, map: number[], start: number, end: number): PhraseSpan | null {
  const origStart = map[start];
  const last = map[end - 1];
  if (origStart === undefined || last === undefined || end <= start) return null;
  const code = text.codePointAt(last);
  const width = code !== undefined && code > 0xffff ? 2 : 1;
  return { start: origStart, end: last + width };
}

function agentFollowsParticiple(folded: string, span: PhraseSpan): boolean {
  const word = folded.slice(span.start, span.end).replace(/[-\s]/g, "");
  if (word !== "audited" && word !== "certified") return false;
  return /^\s*(?:by|from)\b/.test(folded.slice(span.end));
}

function readsNaturally(text: string): boolean {
  const uses = text.split(NEGATED_LABEL).length - 1;
  if (uses !== 1) return false;
  if (/\bthat label\s+(?:it|them|this|us|by|from)\b/i.test(text)) return false;
  return true;
}

function rewriteNegatedMentions(text: string): string | null {
  const folded = foldMapped(text);
  const spans = bannedSpans(folded.text).filter((span) => mentionIsNegated(folded.text, span.start));
  if (spans.length === 0) return text;
  if (spans.length > 1) return null;
  const span = spans[0];
  if (!span || agentFollowsParticiple(folded.text, span)) return null;
  const range = originalRange(text, folded.map, span.start, span.end);
  if (!range) return null;
  const next = `${text.slice(0, range.start)}${NEGATED_LABEL}${text.slice(range.end)}`;
  if (!readsNaturally(next) || bannedPhraseRemains(next)) return null;
  return next;
}

function claimsCompliance(text: string): boolean {
  const lower = foldCompliance(text);
  if (/hipaa[-\s]*compliant/.test(lower) && !lower.includes("not hipaa compliant") && !lower.includes("never call it hipaa compliant")) {
    return true;
  }
  if (/\baudited\b/.test(lower) && !/\bnot audited\b/.test(lower) && !/\bno audits\b/.test(lower)) return true;
  if (/\baudit\b/.test(lower) && !/\bnot audit\b/.test(lower) && !/\bno audits\b/.test(lower)) return true;
  if (/\bcertified\b/.test(lower) && !/\bnot certified\b/.test(lower)) return true;
  if (new RegExp(COMPLIANCE_ATTESTED).test(lower)) return true;
  if (/\bvulnerability[-\s]*free\b/.test(lower)) return true;
  if (/\bno[-\s]+vulnerabilit(?:y|ies)\b/.test(lower)) return true;
  if (/\bsoc[-\s]?2\b/.test(lower)) return true;
  if (/hipaa[-\s]*requirements?/.test(lower)) return true;
  if (/\bcompl(?:y|ies|iance)\b[\s\S]{0,48}\bhipaa\b/.test(lower) || /\bhipaa\b[\s\S]{0,48}\bcompl(?:y|ies|iance)\b/.test(lower)) return true;
  return false;
}

const APPROVED_HIPAA = /designed\s+around\s+hipaa\s+principles/g;

function hipaaOutsideApproved(text: string): boolean {
  const folded = foldCompliance(text);
  if (!folded.includes("hipaa")) return false;
  return folded.replace(APPROVED_HIPAA, " ").includes("hipaa");
}

function leaksPrompt(text: string): boolean {
  return text.includes(PROMPT_MARKER) || text.includes("Visitor message begins") || text.includes("NEARAI_API_KEY") || /\bsk-[A-Za-z0-9_-]{8,}/.test(text);
}

export function givesMedicalAdvice(text: string): boolean {
  return MEDICAL_OUT.some((pattern) => pattern.test(text));
}

function claimBackstop(text: string): boolean {
  return !text.trim() || claimsCompliance(text) || bannedPhraseRemains(text) || /production protection|protection on/i.test(text);
}

// A negator has to govern the phrase. An idiom, a second phrase, or awkward leftover words replace the whole reply.
export function sanitizeAnswer(text: string): { text: string; replaced?: "medical" | "claim" | "prompt" } {
  const visible = stripThinkTags(text);
  if (!visible || leaksPrompt(visible)) return { text: PROMPT_REFUSAL, replaced: "prompt" };
  if (givesMedicalAdvice(visible)) return { text: MEDICAL_REFUSAL, replaced: "medical" };
  if (/production protection|protection on/i.test(visible) || assertsBannedClaim(visible)) {
    return { text: CLAIM_REFUSAL, replaced: "claim" };
  }
  const cleaned = rewriteNegatedMentions(visible);
  if (cleaned === null) return { text: CLAIM_REFUSAL, replaced: "claim" };
  if (hipaaOutsideApproved(cleaned) || (cleaned !== visible && claimBackstop(cleaned))) {
    return { text: CLAIM_REFUSAL, replaced: "claim" };
  }
  return { text: cleaned };
}
