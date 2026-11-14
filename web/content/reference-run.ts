export const GITHUB_REPO = "https://github.com/TendAILabs/TendAI-NEAR";

export const HACKATHON_LINE = "Built for NEAR HACKATHON, privacy and security tracks.";

export const REFERENCE_NOTE =
  "This is the latest guided demo on testnet. It is a past run, not a live check of this visit. Fictional payloads only. Revoke cannot erase a copy already downloaded.";

export type ReferenceCall = {
  id: string;
  method: string;
  who: string;
  quote: string;
  tx: string;
};

export const REFERENCE_RUN: readonly ReferenceCall[] = [
  {
    id: "create_record",
    method: "create_record",
    who: "Riverbend Family Clinic",
    quote: "Riverbend Family Clinic created the record.",
    tx: "Gjku4Ntb1F4y1MvstRHtbhdPmXHVxaCaKZGofw9xGbB9",
  },
  {
    id: "request_referral",
    method: "request_referral",
    who: "Riverbend Family Clinic",
    quote: "Riverbend Family Clinic requested a referral to St. Aster Hospital.",
    tx: "DY3UoKfZ7G2E8rVaF9t83bBDk1TgQagSjHhCXWNTH6zf",
  },
  {
    id: "approve_share",
    method: "approve_share",
    who: "Maya",
    quote: "Maya approved a share with St. Aster Hospital.",
    tx: "74V5FzatREPjXctaR5qetLTpsjFkQcWReRcND9J5D3VB",
  },
  {
    id: "request_open_hospital",
    method: "request_open",
    who: "St. Aster Hospital",
    quote: "St. Aster Hospital opened the record. The ticket was valid for a short window.",
    tx: "GtckzRS9MjCNMc1CcYFPmxcYwYtbWWz5K3cigun6eqAv",
  },
  {
    id: "create_share",
    method: "create_share",
    who: "PulseFit",
    quote: "Maya sent a de-identified copy to PulseFit.",
    tx: "BysDL6zyzKJugaq9F957AmT9n7dbwsuCHMNoSi6mCqtB",
  },
  {
    id: "request_open_app",
    method: "request_open",
    who: "PulseFit",
    quote: "PulseFit opened that copy.",
    tx: "F1yqMFotYZNRZ4XPxKbVuJNwtUgb3XSM5rriFYWkE8zE",
  },
  {
    id: "revoke_share",
    method: "revoke_share",
    who: "Maya",
    quote: "Maya revoked access. Later opens are refused, and a downloaded copy can remain.",
    tx: "4Dx14kSeBWxwjydkTPnbNUNk1887ViFGrvFeDpZpKBcv",
  },
];
