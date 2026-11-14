export const FAQ_ROLES = [
  { id: "patients", label: "Patients" },
  { id: "clinicians", label: "Clinicians" },
  { id: "admins", label: "Admins" },
  { id: "judges", label: "Judges and developers" },
] as const;

export type FaqRole = (typeof FAQ_ROLES)[number]["id"];

export type FaqItem = {
  id: string;
  role: FaqRole;
  q: string;
  title: string;
  body: string[];
};

export const FAQ: readonly FaqItem[] = [
  {
    id: "who-sees",
    role: "patients",
    q: "Who can see Maya's records?",
    title: "Who can see Maya's records?",
    body: [
      "Only the people she approves. Riverbend Family Clinic already holds the source chart, because that is where the story starts.",
      "St. Aster Hospital can open the referral after Maya approves it. Dr. Reyes sees a share only if Maya sends one. PulseFit gets a stripped copy only if she sends one.",
      "Nobody else in this demo can open her chart. Every chart in this demo is fictional.",
    ],
  },
  {
    id: "revoke-does",
    role: "patients",
    q: "What does revoke do?",
    title: "What does revoke do?",
    body: [
      "{revoke} stops that holder from opening the chart again. The stop is an on-chain call, so the next open is refused by the contract.",
      "In the example story, Maya revokes St. Aster Hospital. The next open is refused by the contract check, and that refusal is shown in the app. It is not written as a new transaction.",
    ],
  },
  {
    id: "revoke-limit",
    role: "patients",
    q: "What can revoke not do?",
    title: "What can revoke not do?",
    body: [
      "Revoke cannot erase a copy someone already downloaded or saved. Those copies stay where they are.",
      "This is an honest limit. Revoke does not reach into another person's device and delete a file.",
    ],
  },
  {
    id: "on-chain",
    role: "patients",
    q: "What is stored on NEAR?",
    title: "What is stored on NEAR?",
    body: [
      "The contract stores ids and hashes, plus timestamps: who shared what, with whom, and when.",
      "No health data, names, or chart text are written to the chain. A {hash_on_chain} is a fingerprint, not the chart. You can read the same events in plain words on the custody log.",
    ],
  },
  {
    id: "fictional",
    role: "patients",
    q: "Is this real patient data?",
    title: "Is this real patient data?",
    body: [
      "No. Maya, the clinic, the hospital, Dr. Reyes, PulseFit, and every chart in this demo are fictional.",
      "Do not load a real patient record into this product.",
    ],
  },
  {
    id: "sealed",
    role: "patients",
    q: "What does the sealed summary do?",
    title: "What does the sealed summary do?",
    body: [
      "The summary runs on NEAR AI Cloud inside a verified TEE, and our server passes the selected text to it. Maya reads it before she approves. A signature called {provider_tee} on the {receipt} shows the summary came back from that sealed service.",
      "In this demo the server sees the plaintext chart for the TEE call. The summary is not medical advice.",
    ],
  },
  {
    id: "clinician-steps",
    role: "clinicians",
    q: "What do I do in this walkthrough?",
    title: "What do I do in this walkthrough?",
    body: [
      "Riverbend Family Clinic encrypts the fictional sections in the browser, then asks the contract to record the referral. St. Aster Hospital opens only after Maya approves, using a short-lived {ticket}.",
      "You see the sections she granted. A section she left unticked is not in the copy.",
    ],
  },
  {
    id: "clinician-keys",
    role: "clinicians",
    q: "Whose key signs my actions?",
    title: "Whose key signs my actions?",
    body: [
      "The demo server account uses a fictional testnet key held by the demo server on testnet. The clinic, the hospital, and Dr. Reyes use a {function_call_key} that can call only named methods.",
      "Your own wallet or a key in this browser can call self_register_patient on the live contract and register as a patient.",
    ],
  },
  {
    id: "clinician-revoke",
    role: "clinicians",
    q: "What happens after the patient revokes?",
    title: "What happens after the patient revokes?",
    body: [
      "The next open fails. The contract returns ERR_REVOKED, and the screen can explain that code in plain words.",
      "Revoke cannot erase a copy someone already downloaded. If a file was already saved, revoke does not delete it.",
    ],
  },
  {
    id: "clinician-advice",
    role: "clinicians",
    q: "Is the chart or the summary medical advice?",
    title: "Is the chart or the summary medical advice?",
    body: [
      "No. The fictional chart, the sealed summary, and the hospital reply are examples only. They are not medical advice.",
    ],
  },
  {
    id: "admin-keys",
    role: "admins",
    q: "Where are the keys in this demo?",
    title: "Where are the keys in this demo?",
    body: [
      "The demo server account uses a fictional testnet key held by the demo server on testnet. That key can approve a share. A connected wallet can call self_register_patient on the live contract.",
      "Staff keys for the clinic and the hospital are function-call keys. The private keys are not in this repo.",
    ],
  },
  {
    id: "admin-fc-key",
    role: "admins",
    q: "What is a function-call key?",
    title: "What is a function-call key?",
    body: [
      "A {function_call_key} can call only the methods it was given, and it has a small allowance. It cannot attach the 1 {yoctonear} deposit that patient consent requires, so a staff key cannot approve for the patient.",
    ],
  },
  {
    id: "admin-testnet",
    role: "admins",
    q: "What does testnet mean here?",
    title: "What does testnet mean here?",
    body: [
      "This demo runs on NEAR {testnet}, a practice network. It is not mainnet.",
      "Nothing here is a real payment or a live clinic system. The contract id for this host is listed on Support, with an explorer link.",
    ],
  },
  {
    id: "admin-hipaa",
    role: "admins",
    q: "How should we describe the privacy design?",
    title: "How should we describe the privacy design?",
    body: [
      "Designed around HIPAA principles. Do not use this demo with real patient records.",
      "Removing identifiers is best effort, with a preview. Read that preview before a stripped copy is sent.",
    ],
  },
  {
    id: "judge-real",
    role: "judges",
    q: "What is real, and what is the demo?",
    title: "What is real, and what is the demo?",
    body: [
      "Real: the testnet contract, NEAR AI {tee} summaries with {receipt} values, and on-chain {revoke}.",
      "Demo: fictional data. The demo server account uses a fictional testnet key held by the demo server on testnet. Your own wallet needs a contract upgrade that is not live yet.",
      "Start here is the short version, with a 3-minute walkthrough.",
    ],
  },
  {
    id: "judge-plaintext",
    role: "judges",
    q: "What does the server see during a TEE call?",
    title: "What does the server see during a TEE call?",
    body: [
      "In this demo the server sees the plaintext chart for the TEE call. It sends that text to NEAR AI so the sealed summary can be written.",
      "The {receipt} and the {attestation} let you check the signature kind, {provider_tee}. They do not hide that this demo's server saw the chart on the way in.",
    ],
  },
  {
    id: "judge-deid",
    role: "judges",
    q: "How does removing identifiers work?",
    title: "How does removing identifiers work?",
    body: [
      "Removing identifiers is best effort, with a preview. Common items such as name, date of birth, record number, address, phone, and calendar dates are stripped. Absolute dates become Day 0 or Day +14.",
      "{deidentification} may miss something. Read the preview before anything is sent.",
    ],
  },
  {
    id: "judge-chain",
    role: "judges",
    q: "What is on the chain?",
    title: "What is on the chain?",
    body: [
      "The contract stores ids and hashes, plus timestamps and organization labels. A {hash_on_chain} is a fingerprint, not the chart.",
      "A {nonce} is a one-time value for an open. Replaying it is refused. Health data stays off the chain.",
    ],
  },
  {
    id: "judge-errors",
    role: "judges",
    q: "What should I do with an error code?",
    title: "What should I do with an error code?",
    body: [
      "Contract errors look like ERR_REVOKED. Each of those codes, HTTP 429, and signer not configured maps to a plain sentence and a next step.",
      "429 means this demo is limiting calls for a short while. Wait, then try again. Signer not configured means this host has no key for that role, so the transaction was not sent.",
    ],
  },
  {
    id: "judge-path",
    role: "judges",
    q: "What can I check in about three minutes?",
    title: "What can I check in about three minutes?",
    body: [
      "Follow Start here. Send the referral, approve it, open it, revoke it, and open again. The second open is refused.",
      "Then open Verification for the receipt, and the custody log for ids and hashes. Explorer links are on Support, and on events that saved a transaction hash.",
    ],
  },
];

export function faqForRole(role: FaqRole): FaqItem[] {
  return FAQ.filter((item) => item.role === role);
}
