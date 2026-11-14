export const SECTION_KEYS = ["history", "meds", "labs", "imaging", "notes"] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export type ExpiryDays = 7 | 30 | 90;

export type WalletMethod =
  | "approve_share"
  | "decline_share"
  | "create_share"
  | "revoke_share"
  | "revoke_all_for_record";

export const SECTION_LABEL: Record<SectionKey, string> = {
  history: "History",
  meds: "Medications",
  labs: "Labs",
  imaging: "Imaging",
  notes: "Notes",
};

export const SECTION_BODY: Record<SectionKey, string> = {
  history:
    "Hypertension, 6 years. Chest tightness on stairs for 3 weeks, resolves with rest. Father MI at 61. Ex-smoker. BP 152/94, HR 78, BMI 29.",
  meds: "Lisinopril 20 mg daily. Atorvastatin 20 mg daily.",
  labs: "2026-10-28: LDL 168 mg/dL, HDL 41, A1c 5.9%, creatinine 0.9, TSH normal.",
  imaging: "Resting ECG: nonspecific ST changes. Chest X-ray: normal.",
  notes: "Referred for stress testing and cardiology evaluation.",
};

export const COUNSELING_BODY =
  "2021 counseling visit for anxiety. Not for the cardiology referral.";

export const MAYA = {
  name: "Maya Okafor",
  dob: "1968-03-14",
  mrn: "RB-004417",
  address: "41 Alder Lane, Fictionville",
  phone: "555-0142",
  insurer: "FX-889-2210",
  age: "58",
};

export const ORG = {
  clinic: "Riverbend Family Clinic",
  hospital: "St. Aster Hospital",
  second: "Northgate Heart Institute",
  lakeside: "Lakeside Family Medicine",
  app: "PulseFit",
};

export const PEOPLE = {
  lena: "Dr. Lena Park",
  maya: MAYA.name,
  arjun: "Dr. Arjun Mehta",
  sofia: "Dr. Sofia Reyes",
};

export const TESTNET_CONTRACT = "rr191f8afd-contract.testnet";

export const ACCOUNTS = {
  clinic: "clinic-a.demo.testnet",
  patient: "patient.demo.testnet",
  hospital: "hospital-b.demo.testnet",
  second: "second.demo.testnet",
  app: "pulsefit.demo.testnet",
  contract: TESTNET_CONTRACT,
};

export const HASH = {
  history: "4e8c1a90b7d64f23aa10c5e8d3917b60f2e4c8a1b6d9057e3f4a2c8b1d0e6f77",
  meds: "91ab30c4d8e7521f6a0b9c3e7d1f4a8b2c6e0d9f3a7b5c1e8d4f2a6b0c3e7d91",
  labs: "22c0e91a4b7d3f6e8a1c5b9d0f2e4a7c6b8d1f3e5a9c0b2d4f6a8c1e3b5d7f90",
  imaging: "77aa01c2b3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccdde1",
  notes: "0f1e2d3c4b5a69788796a5b4c3d2e1f0aa11bb22cc33dd44ee55ff6677889900",
  purpose: "bb1944c0d5e6f7a8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70",
  artifact: "cc20aa11bb33cc44dd55ee66ff77889900112233445566778899aabbccddeeff",
  tee: "dd30ff00ee11dd22cc33bb44aa5599887766554433221100ffeeddccbbaa9988",
  request: "ee41ab12cd34ef56ab78cd90ef12ab34cd56ef78ab90cd12ef34ab56cd78ef90",
  response: "ff52bc23de45fa67bc89de01fa23bc45de67fa89bc01de23fa45bc67de89fa01",
  nonce: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
  reply: "1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd",
  second: "5678abcd5678abcd5678abcd5678abcd5678abcd5678abcd5678abcd5678abcd",
  deid: "9abcdeff9abcdeff9abcdeff9abcdeff9abcdeff9abcdeff9abcdeff9abcdeff",
} as const;

export const TX = {
  referral: "stub-tx-referral-7f3ac21",
  approve: "stub-tx-approve-19ab440",
  open: "stub-tx-open-88c01de",
  reply: "stub-tx-reply-42aa019",
  second: "stub-tx-second-55e21c0",
  secondReply: "stub-tx-reyes-reply-61d0",
  deid: "stub-tx-deid-90bb317",
  revoke: "stub-tx-revoke-14e3200",
} as const;

export const MODEL_ID = "z-ai/glm-5.3-flash";

export const SIGNER = "ed25519:DemoModelSignerNearAiWireframe000000000001";

export const ATTESTATION_URL =
  "https://docs.near.ai/cloud/verification/verification-center.md";

export const DEFAULT_PURPOSE = "Cardiology referral: exertional chest tightness";

export const DEFAULT_CONSULT =
  "Recommend a treadmill stress test this week. ECG changes are nonspecific. Start aspirin 81 mg daily if there is no contraindication. Clinic visit offered.";

export const DEFAULT_SECOND_REPLY =
  "I agree with stress testing. No extra imaging from this note. This reply is for the patient only.";

export const CLOCK = {
  record: "2026-11-12 09:14 +07",
  referral: "2026-11-12 09:16 +07",
  consent: "2026-11-12 09:22 +07",
  open: "2026-11-12 09:31 +07",
  reply: "2026-11-12 09:36 +07",
  second: "2026-11-12 09:40 +07",
  deid: "2026-11-12 09:48 +07",
  revoke: "2026-11-12 14:32 +07",
  revokeShort: "14:32 (Bangkok)",
};

export const DIRECTORY = [
  {
    id: "staster",
    org: ORG.hospital,
    who: `${PEOPLE.arjun}, cardiology`,
    story: true,
  },
  {
    id: "northgate",
    org: ORG.second,
    who: PEOPLE.sofia,
    story: false,
  },
  {
    id: "lakeside",
    org: ORG.lakeside,
    who: "New clinic, transfer path",
    story: false,
  },
] as const;

export const DEID_BEFORE: { text: string; label?: string }[] = [
  { text: MAYA.name, label: "name" },
  { text: ", born " },
  { text: MAYA.dob, label: "DOB" },
  { text: ", MRN " },
  { text: MAYA.mrn, label: "MRN" },
  { text: ", " },
  { text: MAYA.address, label: "address" },
  { text: ", phone " },
  { text: MAYA.phone, label: "phone" },
  { text: ", insurer " },
  { text: MAYA.insurer, label: "insurer id" },
  { text: ". Note date " },
  { text: "2026-10-28", label: "date" },
  {
    text: ": BP 152/94. LDL 168 mg/dL, HDL 41, A1c 5.9%. Chest tightness on stairs for 3 weeks, resolves with rest. Hypertension for 6 years. Father MI at 61. Ex-smoker.",
  },
];

export const DEID_AFTER =
  "Adult patient. Hypertension for 6 years. Exertional chest tightness for 3 weeks, resolves with rest. Family history of myocardial infarction. Former smoker. Day 0 is the first note for this episode. Day +14 labs: LDL 168 mg/dL, HDL 41, A1c 5.9%. Blood pressure 152/94. Resting ECG with nonspecific ST changes. Chest X-ray normal.";

export const CIPHERTEXT_SAMPLE =
  '{"v":1,"alg":"x25519-hkdf-sha256+xchacha20poly1305","aad":"r-12|history|v1","nonce":"mN3kP0","ciphertext":"qW8rT1uV","recipients":[{"account_id":"patient.demo.testnet","epk":"a4f0c1","wrapped_dek":"k19c88"}]}';

export const PHI_NEEDLES = [
  MAYA.name,
  "Okafor",
  MAYA.dob,
  MAYA.mrn,
  "41 Alder",
  "Fictionville",
  MAYA.phone,
  MAYA.insurer,
  "lisinopril",
  "atorvastatin",
  "chest tightness",
  "anxiety",
  PEOPLE.lena,
  "Arjun",
  "Sofia",
  "Mehta",
];

export const VERIFIED_CHECKS: { n: number; name: string; detail: string }[] = [
  {
    n: 1,
    name: "Fresh client nonce",
    detail: "32 random bytes, shown as 64 hex characters.",
  },
  {
    n: 2,
    name: "Gateway Intel quote",
    detail: "DCAP verifier accepted the quote. TCB status in this sample: UpToDate.",
  },
  {
    n: 3,
    name: "Nonce bound to report",
    detail: "Report data binds the nonce and the gateway signing address.",
  },
  {
    n: 4,
    name: "Event log and RTMR3",
    detail: "event_log replayed. RTMR3 matches the quote.",
  },
  {
    n: 5,
    name: "Compose measurement",
    detail: "app_compose SHA-256 matches MRCONFIGID.",
  },
  {
    n: 6,
    name: "Model attestations",
    detail: "provider=near. Every candidate passed. GPU evidence included.",
  },
  {
    n: 7,
    name: "E2EE to model key",
    detail: "Message content encrypted to the attested model key.",
  },
  {
    n: 8,
    name: "Response signature",
    detail: "signature_kind provider_tee. Model TEE signed.",
  },
  {
    n: 9,
    name: "Request and response hashes",
    detail: "SHA-256 of the request and the response, shown below.",
  },
  {
    n: 10,
    name: "Receipt hash on NEAR",
    detail: "Committed in approve_share after the patient approves.",
  },
];

/** Canonical pages. Menus live in lib/nav/model.ts. Duplicate routes redirect. */
export const ROUTES: { href: string; label: string; note: string }[] = [
  { href: "/", label: "Landing", note: "Try the 3-minute demo." },
  { href: "/home", label: "Choose a role", note: "Patient, clinician, admin, and proof." },
  { href: "/patient", label: "Requests", note: "Maya approves or denies." },
  { href: "/clinic", label: "New referral", note: "Riverbend Family Clinic sends to St. Aster Hospital." },
  { href: "/hospital", label: "Incoming referrals", note: "Open only after Maya approves." },
  { href: "/patient/sharing", label: "Who has access", note: "Revoke stops future opens." },
  { href: "/onchain", label: "Activity log", note: "Ids and hashes. No chart text." },
  { href: "/audit", label: "Access review", note: "Who can still open records." },
  { href: "/verification", label: "AI check", note: "The summary receipt." },
];
