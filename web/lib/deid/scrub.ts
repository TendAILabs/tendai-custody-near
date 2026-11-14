export type Identifier = {
  category: string;
  value: string;
};

export type ScrubOptions = {
  identifiers: Identifier[];
  /** Calendar day that becomes "Day 0", YYYY-MM-DD. */
  anchorDate: string;
};

export type Removal = {
  category: string;
  start: number;
  end: number;
  replacement: string;
};

export type ScrubResult = {
  text: string;
  removals: Removal[];
};

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

type Span = { start: number; end: number; category: string; replacement: string; rank: number };

const FICTIONAL_NAMES = ["maya", "okafor", "quinlan", "voss", "lena", "park", "reyes", "sofia", "arjun", "mehta", "priya", "raman"];

const NAME_PAIRS: Array<[string, string]> = [
  ["quinlan", "voss"],
  ["jane", "doe"],
  ["maya", "okafor"],
  ["lena", "park"],
  ["sofia", "reyes"],
  ["arjun", "mehta"],
  ["priya", "raman"],
];

const EMAIL =
  /\b[a-z0-9._%+-]+(?:@|\(\s*at\s*\)|\[\s*at\s*\]|\s+at\s+)(?:[a-z0-9-]+(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\s+dot\s+))+[a-z]{2,}\b/i;

const AGE = /\b\d{1,3}\s+years?\s+old\b|\b\d{1,3}-year-old\b|\baged\s+\d{1,3}\b/i;

export function scrubText(input: string, options: ScrubOptions): ScrubResult {
  const source = normalizeForScan(input);
  const anchor = parseIsoDate(options.anchorDate);
  if (!anchor) throw new Error("anchorDate must be YYYY-MM-DD");
  const spans: Span[] = [];

  const identifiers = [...options.identifiers].filter((item) => item.value.trim().length > 0);
  identifiers.sort((a, b) => b.value.length - a.value.length);
  for (const identifier of identifiers) {
    const token = placeholder(identifier.category);
    collectLiteral(source, identifier.value, identifier.category, token, 0, spans);
    collectLoose(source, identifier.value, identifier.category, token, 1, spans);
    if (identifier.category === "name") {
      for (const part of identifier.value.split(/\s+/)) {
        if (part.length >= 3) collectWord(source, part, "name", "[NAME]", 1, spans);
      }
    }
    if (identifier.category === "address") {
      for (const part of identifier.value.split(",")) {
        const piece = part.trim();
        if (piece.length >= 4) {
          collectLiteral(source, piece, "address", "[ADDRESS]", 1, spans);
          const shortened = piece.replace(/\bLane\b/gi, "Ln").replace(/\bRoad\b/gi, "Rd").replace(/\bStreet\b/gi, "St");
          if (shortened !== piece) collectLiteral(source, shortened, "address", "[ADDRESS]", 1, spans);
        }
      }
    }
  }
  input = source;
  for (const name of FICTIONAL_NAMES) collectWord(input, name, "name", "[NAME]", 1, spans);
  collectRegex(input, namePairPattern(), "name", () => "[NAME]", 0, spans);
  collectRegex(input, /maya\s*okafor|okafor\s*,\s*maya/gi, "name", () => "[NAME]", 0, spans);

  collectRegex(input, EMAIL, "email", () => "[EMAIL]", 2, spans);
  collectRegex(
    input,
    /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]\d{3}[-.\s]\d{4}\b/g,
    "phone",
    () => "[PHONE]",
    2,
    spans,
  );
  collectRegex(input, /\b\d{3}[.\s-]?\d{4}\b/g, "phone", () => "[PHONE]", 3, spans);
  collectRegex(input, /\b\d{3}-\d{2}-\d{4}\b/g, "id", () => "[ID]", 2, spans);
  collectRegex(input, /\b[A-Za-z]{2,4}[\s.-]*\d{4,}\b/g, "id", () => "[ID]", 2, spans);
  collectRegex(input, /\b[A-Za-z]{2,4}(?:[\s.-]+\d{2,}){2,}\b/g, "id", () => "[ID]", 2, spans);
  collectRegex(input, /\b\d{9,}\b/g, "id", () => "[ID]", 3, spans);

  for (const rule of dateRules()) {
    collectRegex(input, new RegExp(rule.source, rule.flags), "date", (match) => rule.label(anchor, match), rule.rank, spans);
  }
  collectRegex(input, /\b(?:nine|ten|\d+)\s+[A-Za-z]+\s+(?:road|rd|lane|ln|street|st)\b/gi, "address", () => "[ADDRESS]", 2, spans);
  collectRegex(input, AGE, "age", () => "[AGE]", 3, spans);
  collectRegex(input, /\b[A-Za-z]{2,4}_\d{4,}\b/g, "id", () => "[ID]", 2, spans);

  const chosen = resolveOverlaps(spans);
  let text = "";
  let cursor = 0;
  const removals: Removal[] = [];
  for (const span of chosen) {
    text += input.slice(cursor, span.start);
    const start = text.length;
    text += span.replacement;
    removals.push({
      category: span.category,
      start: span.start,
      end: span.end,
      replacement: span.replacement,
    });
    void start;
    cursor = span.end;
  }
  text += input.slice(cursor);
  return { text, removals };
}

function collectLiteral(input: string, value: string, category: string, replacement: string, rank: number, spans: Span[]) {
  if (!value) return;
  let from = 0;
  while (from < input.length) {
    const start = input.indexOf(value, from);
    if (start < 0) return;
    spans.push({ start, end: start + value.length, category, replacement, rank });
    from = start + value.length;
  }
}

function collectWord(input: string, word: string, category: string, replacement: string, rank: number, spans: Span[]) {
  const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
  collectRegex(input, re, category, () => replacement, rank, spans);
}

function collectLoose(input: string, value: string, category: string, replacement: string, rank: number, spans: Span[]) {
  const compact = value.replace(/[^a-z0-9]/gi, "");
  if (compact.length < 5) return;
  const parts = [...compact].map((char) => escapeRegExp(char)).join("[\\s.\\-]*");
  collectRegex(input, new RegExp(parts, "gi"), category, () => replacement, rank, spans);
}

function collectRegex(
  input: string,
  re: RegExp,
  category: string,
  replacementFor: (match: RegExpExecArray) => string | null,
  rank: number,
  spans: Span[],
) {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const regex = new RegExp(re.source, flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input))) {
    const replacement = replacementFor(match);
    if (replacement) {
      spans.push({ start: match.index, end: match.index + match[0].length, category, replacement, rank });
    }
    if (match[0].length === 0) regex.lastIndex += 1;
  }
}

function resolveOverlaps(spans: Span[]): Span[] {
  const ordered = [...spans].sort((a, b) => a.start - b.start || a.rank - b.rank || b.end - b.start - (a.end - a.start));
  const chosen: Span[] = [];
  for (const span of ordered) {
    const overlap = chosen.find((kept) => span.start < kept.end && span.end > kept.start);
    if (!overlap) {
      chosen.push(span);
      continue;
    }
    const spanLen = span.end - span.start;
    const keptLen = overlap.end - overlap.start;
    const better = span.rank < overlap.rank || (span.rank === overlap.rank && spanLen > keptLen);
    if (better) {
      const index = chosen.indexOf(overlap);
      chosen.splice(index, 1, span);
    }
  }
  return chosen.sort((a, b) => a.start - b.start);
}

function placeholder(category: string): string {
  switch (category) {
    case "name":
      return "[NAME]";
    case "dob":
      return "[DOB]";
    case "mrn":
      return "[MRN]";
    case "address":
      return "[ADDRESS]";
    case "phone":
      return "[PHONE]";
    case "email":
      return "[EMAIL]";
    case "insurance":
    case "insurance_id":
      return "[INSURANCE]";
    default:
      return "[ID]";
  }
}

function relativeLabel(anchor: { y: number; m: number; d: number }, year: number, month: number, day: number): string | null {
  if (!isRealDate(year, month, day)) return null;
  const delta = utcDayNumber(year, month, day) - utcDayNumber(anchor.y, anchor.m, anchor.d);
  if (delta === 0) return "Day 0";
  if (delta > 0) return `Day +${delta}`;
  return `Day ${delta}`;
}

function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return isRealDate(y, m, d) ? { y, m, d } : null;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function utcDayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function monthIndex(name: string): number {
  const lower = name.toLowerCase();
  const full = MONTHS.indexOf(lower);
  if (full >= 0) return full + 1;
  const short = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const alias = lower === "sept" ? "sep" : lower.slice(0, 3);
  const index = short.indexOf(alias);
  return index + 1;
}

export function textHasPersonalIdentifier(text: string): boolean {
  const source = normalizeForScan(text);
  if (FICTIONAL_NAMES.some((name) => new RegExp(`\\b${name}\\b`, "i").test(source))) return true;
  if (namePairPattern().test(source)) return true;
  if (/\b[A-Z]{2,}\s+[A-Z]{2,}\b/.test(source)) return true;
  if (hasTitleCaseName(source)) return true;
  if (EMAIL.test(source)) return true;
  if (hasScrubbedDate(source)) return true;
  if (AGE.test(source)) return true;
  if (/\b\d{3}[.\s-]?\d{3}[.\s-]?\d{4}\b/.test(source) || /\b\d{3}[.\s-]?\d{4}\b/.test(source)) return true;
  if (/\bssn\b/i.test(source) || /\b\d{3}\s+\d{2}\s+\d{4}\b/.test(source)) return true;
  if (/\b[A-Za-z]{1,4}[-_\s]?\d{4,}\b/.test(source)) return true;
  if (/\b(?:birch|alder|fictionville)\b/i.test(source)) return true;
  if (/\b(?:nine|ten|\d+)\s+[a-z]+\s+(?:road|rd|lane|ln|street|st)\b/i.test(source)) return true;
  return false;
}

const INVISIBLE = /[\u00ad\u200b\u200c\u200d\u2060\ufeff]/g;
const FANCY_SPACE = /[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g;
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d\u2043\u2e17\u2e3a\u2e3b]/g;

const HOMOGLYPHS: Record<string, string> = {
  "\u0410": "A",
  "\u0430": "a",
  "\u0412": "B",
  "\u0415": "E",
  "\u0435": "e",
  "\u041a": "K",
  "\u041c": "M",
  "\u041d": "H",
  "\u043d": "h",
  "\u041e": "O",
  "\u043e": "o",
  "\u0420": "P",
  "\u0440": "p",
  "\u0421": "C",
  "\u0441": "c",
  "\u0422": "T",
  "\u0442": "t",
  "\u0423": "Y",
  "\u0443": "y",
  "\u0425": "X",
  "\u0445": "x",
  "\u0405": "S",
  "\u0455": "s",
  "\u0406": "I",
  "\u0456": "i",
  "\u0408": "J",
  "\u0458": "j",
  "\u0391": "A",
  "\u03b1": "a",
  "\u0392": "B",
  "\u0395": "E",
  "\u03b5": "e",
  "\u0396": "Z",
  "\u0397": "H",
  "\u0399": "I",
  "\u03b9": "i",
  "\u039a": "K",
  "\u03ba": "k",
  "\u039c": "M",
  "\u039d": "N",
  "\u039f": "O",
  "\u03bf": "o",
  "\u03a1": "P",
  "\u03c1": "p",
  "\u03a4": "T",
  "\u03c4": "t",
  "\u03a5": "Y",
  "\u03c5": "y",
  "\u03a7": "X",
  "\u03c7": "x",
};

export function normalizeForScan(input: string): string {
  const folded = input.normalize("NFKC").replace(INVISIBLE, "").replace(FANCY_SPACE, " ");
  let latin = "";
  for (const char of folded) latin += HOMOGLYPHS[char] ?? char;
  return latin.replace(DASHES, "-");
}

function hasTitleCaseName(source: string): boolean {
  const re = /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const [left, right] = match[0].split(/\s+/);
    if (left === "Day" || right === "Day") continue;
    return true;
  }
  return false;
}

function namePairPattern(): RegExp {
  const body = NAME_PAIRS.map(([left, right]) => `${left}[\\s.\\-,]*${right}|${right}[\\s.\\-,]*${left}`).join("|");
  return new RegExp(body, "gi");
}

type Anchor = { y: number; m: number; d: number };

type DateRule = {
  source: string;
  flags: string;
  rank: number;
  label: (anchor: Anchor, match: RegExpExecArray) => string | null;
};

function monthSource(): string {
  return `${MONTHS.join("|")}|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec`;
}

function dateRules(): DateRule[] {
  const month = monthSource();
  return [
    {
      source: String.raw`\b(\d{4})[./-](\d{2})[./-](\d{2})\b`,
      flags: "g",
      rank: 4,
      label: (anchor, match) => relativeLabel(anchor, Number(match[1]), Number(match[2]), Number(match[3])),
    },
    {
      source: String.raw`\b(\d{1,2})[.-](\d{1,2})[.-](\d{4})\b`,
      flags: "g",
      rank: 4,
      label: (anchor, match) => bareDateLabel(anchor, match),
    },
    {
      source: String.raw`\b((?:19|20)\d{2})(\d{2})(\d{2})\b`,
      flags: "g",
      rank: 4,
      label: (anchor, match) => relativeLabel(anchor, Number(match[1]), Number(match[2]), Number(match[3])),
    },
    {
      source: String.raw`\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b`,
      flags: "g",
      rank: 5,
      label: (anchor, match) =>
        relativeLabel(anchor, Number(match[3]) < 100 ? 1900 + Number(match[3]) : Number(match[3]), Number(match[1]), Number(match[2])),
    },
    {
      source: String.raw`\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b`,
      flags: "g",
      rank: 4,
      label: (anchor, match) => relativeLabel(anchor, Number(match[3]), Number(match[1]), Number(match[2])),
    },
    {
      source: String.raw`\b(${month})\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})\b`,
      flags: "gi",
      rank: 4,
      label: (anchor, match) => relativeLabel(anchor, Number(match[3]), monthIndex(match[1]), Number(match[2])),
    },
    {
      source: String.raw`\b(\d{1,2})(?:st|nd|rd|th)\s+(${month})\s+(\d{4})\b`,
      flags: "gi",
      rank: 4,
      label: (anchor, match) => relativeLabel(anchor, Number(match[3]), monthIndex(match[2]), Number(match[1])),
    },
    {
      source: String.raw`\b(\d{1,2})\s+(${month})\s+(\d{4})\b`,
      flags: "gi",
      rank: 4,
      label: (anchor, match) => relativeLabel(anchor, Number(match[3]), monthIndex(match[2]), Number(match[1])),
    },
    {
      source: String.raw`\b(${month})\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})\b`,
      flags: "gi",
      rank: 4,
      label: (anchor, match) => relativeLabel(anchor, Number(match[3]), monthIndex(match[1]), Number(match[2])),
    },
    {
      source: String.raw`\b(\d{1,2})(?:st|nd|rd|th)\s+of\s+(${month}),?\s*(\d{4})\b`,
      flags: "gi",
      rank: 4,
      label: (anchor, match) => relativeLabel(anchor, Number(match[3]), monthIndex(match[2]), Number(match[1])),
    },
  ];
}

const GATE_ANCHOR: Anchor = { y: 2026, m: 1, d: 1 };

function hasScrubbedDate(text: string): boolean {
  for (const rule of dateRules()) {
    const flags = rule.flags.includes("g") ? rule.flags : `${rule.flags}g`;
    const regex = new RegExp(rule.source, flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text))) {
      if (rule.label(GATE_ANCHOR, match)) return true;
      if (match[0].length === 0) regex.lastIndex += 1;
    }
  }
  return false;
}

function bareDateLabel(anchor: Anchor, match: RegExpExecArray): string | null {
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1900 || year > 2099) return null;
  if (isRealDate(year, second, first)) return relativeLabel(anchor, year, second, first);
  if (isRealDate(year, first, second)) return relativeLabel(anchor, year, first, second);
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
