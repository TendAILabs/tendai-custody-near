export const HIPAA_LINE = "Designed around HIPAA principles.";

export const SELF_REGISTER_LINE =
  "The demo server account uses a fictional testnet key held by the demo server on testnet. The live contract includes self_register_patient, so a connected wallet can register itself as a patient.";

export const REAL: readonly string[] = [
  "A contract on NEAR testnet records share ids, hashes, and revoke. Support shows that contract id and a link to the testnet explorer.",
  "NEAR AI {tee} summaries come back with a {receipt}. The signature kind on that receipt is {provider_tee}.",
  "Revoke is an on-chain call. The next open is refused by the contract.",
];

export const DEMO: readonly string[] = [
  "Every person, clinic, hospital, and chart in this demo is fictional.",
  SELF_REGISTER_LINE,
  "This build is testnet only. It is not mainnet, not a payment, and not a live clinic system.",
  "In this demo the server sees the plaintext chart for the TEE call. The receipt still shows that the summary was signed in the TEE.",
  "Removing identifiers is best effort, with a preview. Revoke cannot erase a copy someone already downloaded.",
];
