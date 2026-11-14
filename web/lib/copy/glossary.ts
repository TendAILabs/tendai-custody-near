export const GLOSSARY_IDS = [
  "tee",
  "attestation",
  "provider_tee",
  "receipt",
  "ticket",
  "nonce",
  "revoke",
  "hash_on_chain",
  "testnet",
  "yoctonear",
  "function_call_key",
  "deidentification",
] as const;

export type GlossaryId = (typeof GLOSSARY_IDS)[number];

export type GlossaryEntry = {
  id: GlossaryId;
  term: string;
  tip: string;
  body: string[];
};

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "tee",
    term: "TEE",
    tip: "A locked NEAR AI server that writes the summary. In this demo, our server still sees the chart text when it asks for that summary.",
    body: [
      "TEE means trusted execution environment. The summary runs on NEAR AI Cloud inside a verified TEE, and our server passes the selected text to it.",
      "In this demo the server sees the plaintext chart for the TEE call. The lock covers the model run. It does not mean this demo's server never saw the chart.",
    ],
  },
  {
    id: "attestation",
    term: "attestation",
    tip: "A signed statement about the locked server that produced a result. Open it from Verification.",
    body: [
      "An attestation is how you check which kind of server signed a result. Verification links out so you can read that statement.",
      "This demo does not pin a measurement list. The signature kind you should see on a summary is provider_tee.",
    ],
  },
  {
    id: "provider_tee",
    term: "provider_tee",
    tip: "The signature kind on a NEAR AI summary receipt. It means the TEE provider signed the summary.",
    body: [
      "provider_tee is the mark on a sealed summary. Approve stays off until that mark is present.",
      "The receipt carries hashes and this signature kind. It does not put the chart text on chain.",
    ],
  },
  {
    id: "receipt",
    term: "receipt",
    tip: "The signed record of a sealed summary or a de-identification pass. It carries hashes, not the chart.",
    body: [
      "A receipt is the proof that comes back with a TEE summary or a stripped copy. You can read the model, the signature kind, and the hashes on Verification.",
      "The same receipt hash can be stored on the contract. The chart text stays off chain.",
    ],
  },
  {
    id: "ticket",
    term: "ticket",
    tip: "A short-lived on-chain permit to open one share. It is not the chart.",
    body: [
      "The hospital asks the contract for a ticket, then this demo checks that ticket before it returns the chart.",
      "A ticket expires quickly, and a used nonce cannot be replayed. Revoke makes the next open fail even if a ticket was requested.",
    ],
  },
  {
    id: "nonce",
    term: "nonce",
    tip: "A one-time random value bundled into an open. Replaying the same nonce is refused.",
    body: [
      "Each open includes a nonce. The server remembers it for about two minutes and refuses a copy of the same request.",
      "The nonce is not health data. It only stops a repeated open.",
    ],
  },
  {
    id: "revoke",
    term: "revoke",
    tip: "The patient stops a holder from opening that share again. The stop is written on NEAR.",
    body: [
      "Revoke is an on-chain call. The next open is refused by the contract check, and that refusal is shown in the app. It is not written as a new transaction.",
      "Revoke cannot erase a copy someone already downloaded or saved.",
    ],
  },
  {
    id: "hash_on_chain",
    term: "hash on chain",
    tip: "A fingerprint stored on NEAR. It shows that a section or a receipt existed, without storing the chart.",
    body: [
      "The contract stores ids and hashes, plus timestamps. A hash on chain is a fingerprint of a section, a purpose, or a receipt.",
      "You can compare the hash you see in the app with the hash in the transaction. The chart text is not in that transaction.",
    ],
  },
  {
    id: "testnet",
    term: "testnet",
    tip: "NEAR's practice network. This demo uses testnet only. Nothing here is a mainnet payment.",
    body: [
      "Testnet is where this contract lives. Balances and transactions here are for practice.",
      "This build is testnet only. It is not a live clinic system.",
    ],
  },
  {
    id: "yoctonear",
    term: "yoctoNEAR",
    tip: "The smallest NEAR unit. Patient consent attaches 1 yoctoNEAR so a staff key cannot approve.",
    body: [
      "1 yoctoNEAR is the deposit on patient consent calls such as approve, decline, and revoke.",
      "A function-call key cannot attach that deposit. The point is that a staff key cannot consent for the patient. The demo server account uses a fictional testnet key held by the demo server on testnet. A connected wallet can call self_register_patient on the live contract.",
    ],
  },
  {
    id: "function_call_key",
    term: "function-call key",
    tip: "A limited key that can call only named contract methods, with a small allowance.",
    body: [
      "Clinic and hospital staff use a function-call key. It can call only the methods it was given, such as creating a referral or requesting an open.",
      "It cannot approve a share for the patient, because that call needs a 1 yoctoNEAR deposit. PulseFit in this demo still uses a broader testnet key, and the route only lets it request an open.",
    ],
  },
  {
    id: "deidentification",
    term: "de-identification",
    tip: "Removing common identifiers, with a preview first. It is best effort and can miss something.",
    body: [
      "Removing identifiers is best effort, with a preview. The pass strips common items such as name, date of birth, record number, address, phone, and calendar dates. Absolute dates become Day 0 or Day +14.",
      "Read the preview before a stripped copy is sent. The pass may miss something. It is not a promise that the copy cannot be re-identified.",
    ],
  },
];

const BY_ID = new Map(GLOSSARY.map((entry) => [entry.id, entry]));

export function isGlossaryId(value: string): value is GlossaryId {
  return BY_ID.has(value as GlossaryId);
}

export function glossaryEntry(id: GlossaryId): GlossaryEntry {
  const entry = BY_ID.get(id);
  if (!entry) throw new Error(`Missing glossary entry ${id}`);
  return entry;
}
