export type ErrorExplanation = {
  code: string;
  sentence: string;
  next: string;
};

const CONTRACT: ErrorExplanation[] = [
  {
    code: "ERR_NOT_OWNER",
    sentence: "Only the contract owner can do that.",
    next: "Use one of the demo roles on this walkthrough, or read the data with a view call.",
  },
  {
    code: "ERR_NOT_REGISTERED",
    sentence: "That account is not in the directory on this contract.",
    next: "Check the account id, then continue with a demo role from Start here.",
  },
  {
    code: "ERR_ALREADY_REGISTERED",
    sentence: "This account is already registered on the contract as a patient.",
    next: "Continue with the account on this browser. You do not need to register it again.",
  },
  {
    code: "ERR_STORAGE",
    sentence: "The attached deposit does not cover the storage this registration needs.",
    next: "Try instantly again, or use a testnet wallet that can attach a larger deposit.",
  },
  {
    code: "ERR_INACTIVE",
    sentence: "That account is marked inactive, so the contract refused the call.",
    next: "Pick an active demo organization and try the step again.",
  },
  {
    code: "ERR_UNAUTHORIZED",
    sentence: "This account is not allowed to take that step.",
    next: "Switch to the role that owns the record or the share, then try again.",
  },
  {
    code: "ERR_BAD_ROLE",
    sentence: "That account has the wrong role for this share.",
    next: "Send a referral to a hospital, a transfer to a clinic, or a stripped copy to an app.",
  },
  {
    code: "ERR_BAD_STATUS",
    sentence: "The share is not in the state this action needs.",
    next: "Refresh the screen. Approve only a request that is still waiting, and open only an active share.",
  },
  {
    code: "ERR_PARENT",
    sentence: "The parent share does not belong to this record.",
    next: "Start the second opinion or the stripped copy from the record that was already approved.",
  },
  {
    code: "ERR_NO_RECEIPT",
    sentence: "The contract needs a sealed-summary receipt before this share can be approved.",
    next: "Run the sealed summary again, then approve.",
  },
  {
    code: "ERR_OVERFLOW",
    sentence: "A counter on the contract could not grow any further.",
    next: "Stop this walkthrough and note the time on Support. That note stays in the browser.",
  },
  {
    code: "ERR_NOT_FOUND",
    sentence: "The contract has no record, share, or actor with that id.",
    next: "Go back to the step that created it, or start the walkthrough again from Start here.",
  },
  {
    code: "ERR_REVOKED",
    sentence: "The patient already revoked this share, so the next open is refused.",
    next: "That result is expected after revoke. A copy someone already downloaded is still on their device.",
  },
  {
    code: "ERR_EXPIRED",
    sentence: "This share is past its expiry, so the contract will not open it.",
    next: "Ask the patient for a new share with a later expiry.",
  },
  {
    code: "ERR_BAD_EXPIRY",
    sentence: "The expiry is missing, already past, or longer than the contract allows.",
    next: "Pick 7, 30, or 90 days and submit the share again.",
  },
  {
    code: "ERR_BAD_NAME",
    sentence: "That organization name is empty, too long, or not an allowed label.",
    next: "Use the demo organization name and try again.",
  },
  {
    code: "ERR_BAD_KEY",
    sentence: "The encryption public key is not a 64-character hex value.",
    next: "Reload the demo so the directory key can be read again.",
  },
  {
    code: "ERR_BAD_HASH",
    sentence: "A hash on this call is not 64 hex characters.",
    next: "Run the step again so the browser can recompute the hash.",
  },
  {
    code: "ERR_BAD_SECTION",
    sentence: "A section name is unknown, or it was not part of the original request.",
    next: "Grant only sections the clinic asked for: history, meds, labs, imaging, or notes.",
  },
  {
    code: "ERR_DUPLICATE",
    sentence: "The same section was listed twice.",
    next: "Leave each section selected once, then submit again.",
  },
  {
    code: "ERR_TOO_MANY",
    sentence: "Too many sections were included.",
    next: "Remove a section and submit a smaller grant.",
  },
  {
    code: "ERR_BAD_ACCOUNT",
    sentence: "That account id is empty or longer than NEAR allows.",
    next: "Use a testnet account id of 64 characters or fewer and try again.",
  },
  {
    code: "ERR_INIT",
    sentence: "The contract can only be initialized by its own account, with a separate owner.",
    next: "Deploy and initialize in one transaction from the new contract account.",
  },
  {
    code: "ERR_NO_PROPOSAL",
    sentence: "There is no owner proposal waiting to be accepted.",
    next: "Ask the current owner to propose the transfer again.",
  },
  {
    code: "ERR_BAD_NONCE",
    sentence: "That owner proposal number does not match the current proposal.",
    next: "Read the current proposal and accept or cancel that number.",
  },
  {
    code: "ERR_BAD_EPOCH",
    sentence: "The record grant epoch does not match this call.",
    next: "Read the record again and retry with the epoch it returns.",
  },
  {
    code: "ERR_REQUEST_ID_CONFLICT",
    sentence: "This request id was already used with different arguments.",
    next: "Start the step again so the browser can choose a new request id.",
  },
];

const RATE_LIMIT: ErrorExplanation = {
  code: "429",
  sentence: "This demo is limiting calls for a short while.",
  next: "Wait and try again. Daily limits reset at 00:00 UTC.",
};

const SIGNER: ErrorExplanation = {
  code: "signer not configured",
  sentence: "This host has no signing key for that role, so the demo cannot send the transaction.",
  next: "You can still read Start here, Help, and the glossary. Signing needs a configured testnet key on the server.",
};

const UNKNOWN: ErrorExplanation = {
  code: "unknown",
  sentence: "This step failed.",
  next: "Reload and try the step again. If it keeps failing, note the time on Support. That note stays in this browser.",
};

export const ERROR_EXPLANATIONS: readonly ErrorExplanation[] = [...CONTRACT, RATE_LIMIT, SIGNER];

const BY_CODE = new Map(ERROR_EXPLANATIONS.map((entry) => [entry.code, entry]));

function refused(code: string): ErrorExplanation {
  return {
    code,
    sentence: "The contract refused this step.",
    next: "Go back to the role that owns the record and try again.",
  };
}

function fromText(text: string): ErrorExplanation {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (lower === "429" || lower === "rate limit") return RATE_LIMIT;
  if (lower.includes("signer not configured")) return SIGNER;
  const code = /ERR_[A-Z0-9_]+/.exec(trimmed)?.[0];
  if (code) return BY_CODE.get(code) ?? refused(code);
  return UNKNOWN;
}

export function explainError(input: unknown): ErrorExplanation {
  if (typeof input === "number") return input === 429 ? RATE_LIMIT : UNKNOWN;
  if (typeof input === "string") return fromText(input);
  if (input instanceof Error) return fromText(input.message);
  if (input && typeof input === "object") {
    const record = input as { error?: unknown; status?: unknown; message?: unknown };
    if (record.status === 429) return RATE_LIMIT;
    if (typeof record.error === "string") return fromText(record.error);
    if (typeof record.message === "string") return fromText(record.message);
  }
  return UNKNOWN;
}
