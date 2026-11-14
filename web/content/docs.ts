/**
 * TendAI Custody documentation copy.
 * Every statement is taken from the contract, the web app, or docs/ in this repo.
 * WHITEPAPER_URL and WHITEPAPER_PDF_URL stay null until a paper exists.
 */

export const WHITEPAPER_URL: string | null = null;
export const WHITEPAPER_PDF_URL: string | null = null;

export const DOC_TITLE = "Docs | TendAI Custody";

export const DOC_DESCRIPTION =
  "How TendAI Custody records patient-approved clinic-to-hospital referrals on NEAR testnet, what the contract stores, and what this hackathon demo does not do.";

export const CONTRACT_ID = "rr191f8afd-contract.testnet";
export const OWNER_ID = "rr191f8afd-owner.testnet";

export const EXPLORER_ACCOUNT = `https://testnet.nearblocks.io/address/${CONTRACT_ID}`;

export type FlowStep = {
  n: string;
  actor: string;
  hue: "clinic" | "patient" | "hospital" | "refused";
  title: string;
  text: string;
};

export const FLOW_STEPS: readonly FlowStep[] = [
  {
    n: "01",
    actor: "Clinic",
    hue: "clinic",
    title: "Create record",
    text: "The clinic encrypts the selected sections on its own side and calls create_record. The contract stores section hashes, not the chart.",
  },
  {
    n: "02",
    actor: "Clinic",
    hue: "clinic",
    title: "Request referral",
    text: "request_referral names the hospital, the sections, and a purpose hash. The share stays Requested.",
  },
  {
    n: "03",
    actor: "Patient",
    hue: "patient",
    title: "Approve",
    text: "The patient reads the NEAR AI Cloud summary, then approve_share with 1 yoctoNEAR. The grant can be narrower than the request, and it has an expiry.",
  },
  {
    n: "04",
    actor: "Hospital",
    hue: "hospital",
    title: "Open",
    text: "request_open writes a 120 second ticket for the hospital or the patient. The web app releases the ciphertext only when that ticket checks out.",
  },
  {
    n: "05",
    actor: "Patient",
    hue: "patient",
    title: "Revoke",
    text: "revoke_share sets that share to Revoked. It does not delete a file someone already saved.",
  },
  {
    n: "06",
    actor: "Hospital",
    hue: "refused",
    title: "Refused open",
    text: "A later request_open panics ERR_REVOKED. The attack demo recorded that refusal on testnet.",
  },
];

export type ActorRow = {
  name: string;
  role: string;
  does: string;
};

export const ACTORS: readonly ActorRow[] = [
  {
    name: "Clinic",
    role: "Contract role Clinic",
    does: "Creates the record and requests the referral. In the guided demo this is Riverbend Family Clinic. The deploy kit function-call key may call create_record and request_referral.",
  },
  {
    name: "Hospital",
    role: "Contract role Clinic",
    does: "Receives the referral. The contract has no separate Hospital role, so the hospital account is registered as Clinic. Its function-call key may call request_open and submit_reply. In the story this is St. Aster Hospital.",
  },
  {
    name: "Patient",
    role: "Contract role Patient",
    does: "Approves, declines, creates a further share, and revokes. Those calls attach exactly 1 yoctoNEAR, so the demo patient key is a full-access key. In the story this is Maya Okafor. The chart is fictional.",
  },
  {
    name: "App",
    role: "Contract role App",
    does: "Can receive a DeidApp share. Its function-call key may call request_open. In the story this is PulseFit. It gets a stripped copy only if the patient sends one.",
  },
];

export type Table = {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
};

export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: readonly string[] }
  | { kind: "table"; table: Table }
  | { kind: "flow" }
  | { kind: "actors" }
  | { kind: "methods" }
  | { kind: "whitepaper" }
  | { kind: "faq" };

export type DocSection = {
  id: string;
  index: string;
  kicker: string;
  title: string;
  blocks: readonly DocBlock[];
};

export type ContractMethod = {
  name: string;
  kind: "init" | "call" | "view";
  args: string;
  note: string;
};

export const CONTRACT_METHODS: readonly ContractMethod[] = [
  {
    name: "new",
    kind: "init",
    args: "owner: AccountId",
    note: "Predecessor must be the contract account. Owner must be a different account. No migrate method.",
  },
  {
    name: "staff_method_names",
    kind: "view",
    args: "none",
    note: "Returns create_record, request_referral, request_open, request_owner_open, submit_reply.",
  },
  {
    name: "get_owner",
    kind: "view",
    args: "none",
    note: "Returns the owner account.",
  },
  {
    name: "get_owner_proposal",
    kind: "view",
    args: "none",
    note: "Returns proposed, nonce, and expires_at_ns, or null.",
  },
  {
    name: "propose_owner",
    kind: "call",
    args: "new_owner: AccountId, expires_at_ns: U64",
    note: "Owner only. Exactly 1 yoctoNEAR. Expiry is in the future and at most seven days out. Returns the proposal nonce.",
  },
  {
    name: "accept_owner",
    kind: "call",
    args: "proposal_nonce: U64",
    note: "Proposed owner only. Exactly 1 yoctoNEAR. Must be strictly before expiry.",
  },
  {
    name: "cancel_owner",
    kind: "call",
    args: "proposal_nonce: U64",
    note: "Owner only. Exactly 1 yoctoNEAR.",
  },
  {
    name: "register_actor",
    kind: "call",
    args: "account_id: AccountId, role: Clinic | Patient | App, display_name: string, enc_pubkey: 64 hex",
    note: "Owner only. Insert only. Deposit must cover the new row. Excess is refunded. Display name must look like an organization, at most 64 characters.",
  },
  {
    name: "self_register_patient",
    kind: "call",
    args: "enc_pubkey: 64 hex",
    note: "Caller registers only itself as Patient and pays for that row.",
  },
  {
    name: "rotate_enc_key",
    kind: "call",
    args: "enc_pubkey: 64 hex",
    note: "Self only. The same key is a no-op. Future shares use the new key. Old shares are not re-wrapped.",
  },
  {
    name: "encryption_context",
    kind: "view",
    args: "caller: AccountId, method: CreateRecord | RequestReferral | CreateShare | SubmitReply, request_id: 64 hex",
    note: "Returns the hex SHA-256 context. The numeric id is not an input.",
  },
  {
    name: "get_operation",
    kind: "view",
    args: "account_id: AccountId, method: CreateMethod, request_id: 64 hex",
    note: "Returns the first result for that caller, method, and request id, if any.",
  },
  {
    name: "create_record",
    kind: "call",
    args: "request_id: 64 hex, patient: AccountId, sections: { key, cipher_hash }[]",
    note: "Caller must be Clinic. Patient must be Patient. Section keys are history, meds, labs, imaging, notes. A repeated request id with the same arguments returns the original id and emits nothing.",
  },
  {
    name: "request_referral",
    kind: "call",
    args: "request_id: 64 hex, record_id: U64, expected_epoch: U64, to: AccountId, requested_sections: string[], purpose_hash: 64 hex",
    note: "Caller must be the clinic that created the record. Recipient must be a different Clinic-role actor. Returns a share id. Status is Requested.",
  },
  {
    name: "approve_share",
    kind: "call",
    args: "share_id: U64, granted_sections: string[], expires_at_ns: U64, read_only: bool, artifact_hash: 64 hex, tee_receipt_hash: 64 hex",
    note: "Patient only. Exactly 1 yoctoNEAR. Grant must be a subset of the request. Expiry must be in the future and at most 365 days out. The contract checks that the receipt hash is 64 hex. It does not verify a TEE attestation.",
  },
  {
    name: "decline_share",
    kind: "call",
    args: "share_id: U64",
    note: "Patient only. Exactly 1 yoctoNEAR. Share must be Requested.",
  },
  {
    name: "create_share",
    kind: "call",
    args: "request_id, record_id, expected_epoch, to, kind: SecondOpinion | Transfer | DeidApp, sections, expires_at_ns or null, read_only, purpose_hash, artifact_hash, tee_receipt_hash or null, parent or null",
    note: "Patient only. Exactly 1 yoctoNEAR. DeidApp requires an App recipient and a receipt hash. SecondOpinion and Transfer require a Clinic recipient. An empty section list is allowed only for DeidApp.",
  },
  {
    name: "request_open",
    kind: "call",
    args: "share_id: U64, nonce_hash: 64 hex",
    note: "Caller must be the recipient or the patient. Share must be active, in the current grant epoch, and not expired. Replaces the ticket slot. Ticket lifetime is 120 seconds.",
  },
  {
    name: "request_owner_open",
    kind: "call",
    args: "record_id: U64, nonce_hash: 64 hex",
    note: "Caller must be the patient or the clinic that created the record.",
  },
  {
    name: "submit_reply",
    kind: "call",
    args: "request_id: 64 hex, share_id: U64, expected_epoch: U64, reply_hash: 64 hex",
    note: "Recipient of a Referral or SecondOpinion. The share must still be openable. Creates a Reply share back to the patient. The reply text is not stored.",
  },
  {
    name: "revoke_share",
    kind: "call",
    args: "share_id: U64",
    note: "Patient only. Exactly 1 yoctoNEAR. Active or Requested only. Does not revoke child shares.",
  },
  {
    name: "revoke_all_for_record",
    kind: "call",
    args: "record_id: U64, expected_epoch: U64",
    note: "Patient only. Exactly 1 yoctoNEAR. Passing the current epoch bumps it and emits one record_grants_revoked event. The call does not walk the shares. Passing the epoch this call already produced returns that epoch and emits nothing.",
  },
  {
    name: "get_actor",
    kind: "view",
    args: "account_id: AccountId",
    note: "Account, role, display name, encryption public key, active flag, key version.",
  },
  {
    name: "list_actors",
    kind: "view",
    args: "from_index: u32, limit: u32",
    note: "Limit is capped at 50. A limit of 0 returns an empty list.",
  },
  {
    name: "get_record",
    kind: "view",
    args: "record_id: U64",
    note: "Sections are key plus cipher hash. Also returns grant epoch, share count, and open counters.",
  },
  {
    name: "get_share",
    kind: "view",
    args: "share_id: U64",
    note: "Includes status and effective_status. Expired is computed from the block timestamp.",
  },
  {
    name: "list_shares_for_record",
    kind: "view",
    args: "record_id: U64, from_index: u32, limit: u32",
    note: "Pages that record's share index. Limit capped at 50.",
  },
  {
    name: "list_shares_for_recipient",
    kind: "view",
    args: "account_id: AccountId, from_index: u32, limit: u32",
    note: "Pages shares addressed to that account. Limit capped at 50.",
  },
  {
    name: "list_pending_for_patient",
    kind: "view",
    args: "patient: AccountId, from_index: u32, limit: u32",
    note: "Pending shares for that patient. Limit capped at 50.",
  },
  {
    name: "check_ticket",
    kind: "view",
    args: "share_id: U64, account_id: AccountId, nonce_hash: 64 hex",
    note: "True only when the share is effectively active and the nonce matches a ticket younger than 120 seconds.",
  },
  {
    name: "check_record_ticket",
    kind: "view",
    args: "record_id: U64, account_id: AccountId, nonce_hash: 64 hex",
    note: "Same 120 second check for a record open by the patient or the creating clinic.",
  },
];

export type ClaimRow = {
  claim: string;
  code: string;
  test: string;
};

export const CLAIMS: readonly ClaimRow[] = [
  {
    claim: "Fresh state is schema 2, with no migration from schema 1.",
    code: "contract/src/lib.rs (SCHEMA_VERSION) and contract/DESIGN-V2.md",
    test: "contract/src/unit_tests.rs fresh_state_is_schema_v2_without_a_migration_path",
  },
  {
    claim: "Events use NEP-297 standard referral_relay at version 2.0.0.",
    code: "contract/src/events.rs",
    test: "contract/src/unit_tests.rs register_create_and_referral_events",
  },
  {
    claim: "An unregistered account or a patient cannot create a record.",
    code: "contract/src/lib.rs create_record",
    test: "contract/src/unit_tests.rs unregistered_account_cannot_create_record and patient_cannot_create_record",
  },
  {
    claim: "approve_share, decline_share, create_share, revoke_share, and revoke_all_for_record require exactly 1 yoctoNEAR.",
    code: "contract/src/lib.rs assert_one_yocto on those methods",
    test: "contract/src/unit_tests.rs approve_without_one_yocto_fails; contract/tests/sandbox.rs rejects a function-call key on approve_share",
  },
  {
    claim: "The patient can narrow the granted sections and cannot add one. Expiry past 365 days is rejected.",
    code: "contract/src/lib.rs approve_share and require_future_expiry",
    test: "contract/src/unit_tests.rs approve_narrows_scope_and_sets_active, approve_cannot_add_a_section, approve_rejects_expiry_past_365_days",
  },
  {
    claim: "A caller who is not the recipient or the patient cannot open.",
    code: "contract/src/lib.rs request_open",
    test: "contract/src/unit_tests.rs unauthorized_open_is_rejected. Attack demo transaction C5oaSkJTX61yDwc4y6H3wyKdXL1AnPcFrQ8Mbjn5Yi6k in docs/ATTACK-DEMO-RESULT.md",
  },
  {
    claim: "After revoke, the next open fails with ERR_REVOKED.",
    code: "contract/src/lib.rs revoke_share and request_open",
    test: "contract/src/unit_tests.rs revoke_then_open_fails and contract/tests/sandbox.rs. Attack demo transaction CGaCe4yTiSc5uc9Rtwuc82BFy72bZ5sbdwq8r4QjGf8L",
  },
  {
    claim: "An expired share fails open with ERR_EXPIRED. The open ticket lasts 120 seconds.",
    code: "contract/src/lib.rs TICKET_TTL_NS and effective status",
    test: "contract/src/unit_tests.rs lazy_expiry_blocks_open and open_by_recipient_and_check_ticket_window. Sandbox fast-forward covers expiry.",
  },
  {
    claim: "Record-wide revoke bumps the grant epoch and does not walk child shares.",
    code: "contract/DESIGN-V2.md and revoke_all_for_record",
    test: "contract/src/unit_tests.rs revoke_all_epoch_covers_requested_children_and_replies",
  },
  {
    claim: "A DeidApp share requires an App recipient and a receipt hash.",
    code: "contract/src/lib.rs create_share",
    test: "contract/src/unit_tests.rs deid_app_requires_a_receipt and deid_app_rejects_a_clinic_recipient",
  },
  {
    claim: "Chart sections are encrypted with X25519, HKDF-SHA256, and XChaCha20-Poly1305. A swapped AAD or a wrong key does not decrypt.",
    code: "web/lib/crypto/envelope.ts",
    test: "web/lib/crypto/envelope.test.ts (AAD swap fails, wrong key fails)",
  },
  {
    claim: "Wrapping uses the encryption public key stored on the contract when a server-offered key differs.",
    code: "web/lib/relay/keys.ts",
    test: "web/lib/relay/keys.test.ts. The attack demo key-substitution check is local and has no transaction.",
  },
  {
    claim: "The summary model must be z-ai/glm-5.3-flash. Other model ids are refused at startup.",
    code: "web/lib/relay/policy.ts and web/lib/tee/completion.ts",
    test: "web/lib/relay/policy.test.ts",
  },
  {
    claim: "A summary is kept only when the receipt says signatureKind provider_tee.",
    code: "web/lib/tee/live.ts and the summary route",
    test: "web/lib/tee/summary-retry.test.ts and web/lib/tee/completion-gate.test.ts",
  },
  {
    claim: "De-identification blocks a leftover fixture identifier and a classifier span at or above 0.5.",
    code: "web/lib/deid/pipeline.ts",
    test: "web/lib/deid/pipeline.test.ts",
  },
  {
    claim: "An open without a fresh ticket is HTTP 403. Reusing a nonce is HTTP 403.",
    code: "web/lib/open/handle.ts",
    test: "web/lib/open/handle.test.ts. Attack demo nonce replay is local: first HTTP 200, second HTTP 403.",
  },
  {
    claim: "The 2026-11-14 attack demo passed 11 of 11 on the schema 2 contract, and phi-scan reported zero fixture identifiers.",
    code: "scripts/attack-demo.ts and scripts/phi-scan.ts",
    test: "docs/ATTACK-DEMO-RESULT.md",
  },
];

export type FaqItem = {
  id: string;
  question: string;
  answer: readonly string[];
};

export const FAQ: readonly FaqItem[] = [
  {
    id: "revoke",
    question: "What happens when I revoke?",
    answer: [
      "revoke_share is a patient call. It attaches exactly 1 yoctoNEAR, which a function-call key cannot do. The share status becomes Revoked. The next request_open panics ERR_REVOKED.",
      "The 2026-11-14 attack demo recorded that refusal in transaction CGaCe4yTiSc5uc9Rtwuc82BFy72bZ5sbdwq8r4QjGf8L. Revoke does not erase a copy that was already downloaded. revoke_share does not revoke child shares. revoke_all_for_record bumps the record grant epoch so older shares, including children and replies, are effectively revoked. That call does not walk them.",
    ],
  },
  {
    id: "who-sees",
    question: "Who can see my record?",
    answer: [
      "request_open succeeds only for the share recipient or the patient, and only while the share is active, in the current grant epoch, and not past its expiry. The clinic that created the record can call request_owner_open. Anyone can read the public log of account ids, hashes, and timestamps.",
      "Chart text is not stored on the contract. In the guided demo, Riverbend Family Clinic is where the fictional chart starts, so that clinic already holds it. St. Aster Hospital opens the share after Maya approves. PulseFit and a second opinion see a share only if the patient sends one. Every chart in this demo is fictional.",
    ],
  },
  {
    id: "tee-sees",
    question: "What does the TEE see?",
    answer: [
      "POST /api/tee/summary receives the chart text and sends it to NEAR AI Cloud, model z-ai/glm-5.3-flash. The handler does not write that text to Redis, the blob store, or the log. The log line is the status and the elapsed time. The server keeps the summary only when verifyResponse reports signatureKind provider_tee.",
      "NEAR AI Cloud does not re-encrypt for the hospital and does not hold the data key. The patient's side wraps a new data key to the hospital public key stored on the contract. In this demo the app server sees the plaintext on the way into the summary call. The browser cannot perform the gateway TLS binding check. The contract stores the receipt hash as 64 hex characters and does not check an attestation.",
    ],
  },
  {
    id: "why-near",
    question: "Why NEAR?",
    answer: [
      "The contract is a neutral record that no clinic can edit. Two hospitals do not have to trust each other's database. Events follow NEP-297, standard referral_relay, version 2.0.0, so a judge can read them on the testnet explorer without trusting this website.",
      "Patient approval, decline, and revoke attach exactly 1 yoctoNEAR. A function-call key cannot attach that deposit, so a clinic staff key cannot consent for the patient. Shade Agents, Chain Signatures, and NEAR Intents are not used. This build is testnet only.",
    ],
  },
  {
    id: "on-chain",
    question: "What is stored on chain?",
    answer: [
      "The contract stores actor account ids, roles, organization display names, and encryption public keys. It stores section hashes, share scope, purpose hashes, expiry, status, grant epoch, open counters, and ticket nonce hashes. Custody events are the NEP-297 log.",
      "It does not store chart text. Schema 2 has no get_timeline. A view of contract state cannot reconstruct every open by itself. History is the receipt log plus the counters on the record and the share. U64 arguments are JSON strings. Page views cap limit at 50.",
    ],
  },
  {
    id: "production",
    question: "Is this production ready?",
    answer: [
      "No. It is a hackathon prototype on NEAR testnet. It is not a live clinic system and not mainnet. It is designed around HIPAA principles: patient authorization, minimum necessary, and access logs.",
      "Demo signing keys and the encryption seed live on the server for the guided demo. Revoking cannot erase a downloaded copy. Removing identifiers is best effort, with a preview. Rate limits are best effort across instances. There is no contract method that upgrades the code. A full-access key on the contract account could still deploy new code. This repository does not delete that key.",
    ],
  },
  {
    id: "real-data",
    question: "What data is real?",
    answer: [
      `The schema 2 contract account ${CONTRACT_ID} is on testnet. Its owner is ${OWNER_ID}. The transactions named in docs/ATTACK-DEMO-RESULT.md are real testnet calls. The payloads in that run were fictional.`,
      "People, clinics, and chart text in the app are fictional. Do not load a real patient record. web/lib/fixtures.ts names the schema 2 account. The root README still names an older account and event version 1.0.0. The running server reads RELAY_CONTRACT_ID when that variable is set.",
    ],
  },
  {
    id: "verify",
    question: "How do I verify a transfer myself?",
    answer: [
      "Start at [Guided demo](/home?guide=1). The path is: set up Maya, Riverbend Family Clinic sends the referral, Maya approves, St. Aster Hospital opens, Maya revokes, the hospital open is refused, then [the proof log](/onchain?desk=proof).",
      `Open a transaction hash from that log, or from docs/ATTACK-DEMO-RESULT.md, on https://testnet.nearblocks.io/txns/. The app uses that explorer. It does not link explorer.testnet.near.org, because that host opens an explorer picker. You can also view ${CONTRACT_ID} and call get_share or get_record. The proof page copies the last attack-demo table. It does not run the attacks again.`,
    ],
  },
  {
    id: "cost",
    question: "What does it cost?",
    answer: [
      "Consent calls attach exactly 1 yoctoNEAR. The contract keeps that deposit. It is the proof of a full-access key, not a fee, and it is not refunded. Function-call keys in deploy-kit/provision.sh are added with an allowance of 1 NEAR. Testnet NEAR is not a payment.",
      "NEAR AI calls are refused when the next estimate would pass $4. The spend code also names a $5 cap. Public list prices on 2026-11-09 put z-ai/glm-5.3-flash at input 80 and output 500, and openai/privacy-filter at input 10 and output 0, in the public price units (scale 9). This page does not quote a gas price for one referral. Gas varies, and this is testnet.",
    ],
  },
  {
    id: "key-leak",
    question: "What if a hospital key leaks?",
    answer: [
      "The hospital function-call key in the deploy kit may call only request_open and submit_reply on this contract, with a 1 NEAR allowance. It cannot attach NEAR, so it cannot approve, decline, or revoke, and it cannot transfer the account balance. request_open still checks that the caller is the share recipient or the patient.",
      "rotate_enc_key changes that account's encryption public key for future shares only. Shares already wrapped to the old key are not re-wrapped. A lost device key means the clinic re-issues the record. The demo patient key is a full-access key held by the server, which is a wider key than the staff keys. Private keys are not in this repository.",
    ],
  },
  {
    id: "app-reads",
    question: "Can the app read my chart?",
    answer: [
      "The contract cannot. It stores hashes. In this demo the server does see plaintext in two places: the TEE summary request, and the open route, which can decrypt a demo envelope with DEMO_ENC_SEED and return that text in the response. It does not write that text to Redis or the blob store. A local device key in IndexedDB is a different path. The guided demo does not keep the clinic key only on the device.",
      "PulseFit is the App actor. It can open a DeidApp share the patient created. That copy is de-identified on a best-effort basis, and the patient sees a preview first. The app function-call key may call request_open only.",
    ],
  },
  {
    id: "consent",
    question: "How is consent recorded?",
    answer: [
      "The patient calls approve_share with exactly 1 yoctoNEAR. The arguments are the granted sections, an expiry, a read-only flag, an artifact hash, and a tee receipt hash. The share becomes Active. The contract emits share_consented and share_transformed.",
      "decline_share records a refusal the same way, with 1 yoctoNEAR, and emits share_declined. The guided demo asks the patient to read the summary before approving. The server will not treat a forged 64-hex receipt as the summary it issued: that path returns HTTP 403. The contract itself still accepts any 64-hex receipt when a transaction is signed outside this app.",
    ],
  },
  {
    id: "decline-expire",
    question: "What if I decline, or the share expires?",
    answer: [
      "decline_share is only valid while the share is Requested. The hospital cannot open a declined share. Expiry is lazy. When the block timestamp is past expires_at_ns, request_open fails with ERR_EXPIRED. The maximum expiry is 365 days from the call.",
      "An open ticket is separate from the share expiry. check_ticket stays true for 120 seconds after request_open, and only while the share is still effectively active. The server also remembers a used nonce so the same nonce cannot open twice inside that window. That memory is per instance.",
    ],
  },
  {
    id: "off-chain",
    question: "What stays off the chain?",
    answer: [
      "Chart text, the summary text, and ciphertext blobs stay off the contract. The blob helper keeps bytes in process memory and in a file under BLOB_DIR, or .data/blobs. It does not set an expiry. A body over one million bytes is rejected. A later open on another hosted function does not see that file. The browser keeps the ciphertext and sends it again.",
      "Upstash, when configured, stores a spend counter and support tickets. Support tickets expire 30 days after the last write. They are not chart text. The visitor cookie holds ids and receipt hashes, not the chart. A summary receipt in that cookie expires after 10 minutes.",
    ],
  },
];

const REAL_TABLE: Table = {
  caption: "What is live on testnet, what is fictional, and what is only a check in the app or a recording.",
  columns: ["Piece", "Kind", "Where this is grounded"],
  rows: [
    [
      `${CONTRACT_ID}, schema 2, owner ${OWNER_ID}`,
      "Live on testnet",
      "docs/ATTACK-DEMO-RESULT.md names the owner. deploy-kit/provision.sh names the contract PREFIX-contract.testnet. get_owner on this account returns that owner.",
    ],
    [
      "create_record, request_referral, approve_share, request_open, submit_reply, revoke_share, and the refused open",
      "Live on testnet",
      "docs/ATTACK-DEMO-RESULT.md, 2026-11-14, 11 of 11. Fictional payloads. No deploy in that run.",
    ],
    [
      "NEP-297 events, standard referral_relay, version 2.0.0",
      "Live on testnet",
      "contract/src/events.rs. Unit test register_create_and_referral_events.",
    ],
    [
      "Section encryption and re-wrap to the hospital public key",
      "Live in the demo browser, keys seeded for the demo",
      "web/lib/crypto/envelope.ts. Demo actor keys are derived from DEMO_ENC_SEED. The seed is not in the repo.",
    ],
    [
      "NEAR AI Cloud summary on z-ai/glm-5.3-flash when the demo runs that call",
      "Live call, fictional chart",
      "web/lib/tee/completion.ts. Kept only for signatureKind provider_tee.",
    ],
    [
      "Maya Okafor, Riverbend Family Clinic, St. Aster Hospital, Northgate Heart Institute, Lakeside Family Medicine, Dr. Reyes, PulseFit, and every chart",
      "Fictional",
      "web/lib/fixtures.ts. The attack demo registered those organization names as actors. The people are not chart data on chain.",
    ],
    [
      "Guided demo signing",
      "Fictional demo keys on the server",
      "README Security. The server picks the signer from the role. The request cannot pick an account id.",
    ],
    [
      "On-chain tee_receipt_hash",
      "Hash only. The chain does not verify the TEE",
      "contract/DESIGN-V2.md. The app checks provider_tee before it will approve from this server.",
    ],
    [
      "Verification page rows for RTMR3, nonce binding, compose measurement, model measurements, browser encryption, and the on-chain receipt",
      "Not checked on that page",
      "web/lib/near/proof.ts leaves those rows not-checked. Signature kind can pass. Gateway TCB can pass when the summary included a server check through the NEAR AI SDK. This browser does not verify the quote.",
    ],
    [
      "Attack list on the proof page",
      "A recording, not a live run",
      "web/components/wireframe/activity/verify-panel.tsx. The source table is docs/ATTACK-DEMO-RESULT.md.",
    ],
    [
      "Nonce replay, key substitution, and a flipped ciphertext byte",
      "Local checks in the attack script",
      "docs/ATTACK-DEMO-RESULT.md. Those three rows have no transaction.",
    ],
    [
      "Landing proof",
      "Reference-run transactions",
      "web/components/landing/proof.tsx links the guided-demo transactions, the testnet contract, and the GitHub repository. It does not label them example data.",
    ],
    [
      "README event version 1.0.0",
      "Older text in the repo",
      "README.md still names an older contract account and event version 1.0.0. web/lib/fixtures.ts names the schema 2 account. The contract source on this commit is schema 2.",
    ],
    [
      "Shade Agents, Chain Signatures, and NEAR Intents",
      "Not used",
      "README.md.",
    ],
  ],
};

const KEY_TABLE: Table = {
  caption: "Function-call key methods from deploy-kit/provision.sh. Allowance on each key is 1 NEAR.",
  columns: ["Signer", "Methods on the function-call key", "Consent"],
  rows: [
    ["Clinic, and Lakeside uses the same list", "create_record, request_referral", "Cannot approve or revoke."],
    ["Hospital", "request_open, submit_reply", "Cannot approve or revoke."],
    ["Second opinion", "request_open, submit_reply", "Cannot approve or revoke."],
    ["App (PulseFit)", "request_open", "Cannot approve or revoke."],
    [
      "Patient in the guided demo",
      "Full-access key, not the function-call list",
      "approve_share, decline_share, create_share, revoke_share, and revoke_all_for_record need 1 yoctoNEAR.",
    ],
  ],
};

const CHAIN_TABLE: Table = {
  caption: "What the contract holds compared with what the server and the browser hold.",
  columns: ["On the contract", "Off the contract"],
  rows: [
    [
      "Account ids, roles, organization display names, encryption public keys",
      "Chart text, summary text, and the data encryption key",
    ],
    [
      "Section hashes, purpose hashes, artifact hashes, receipt hashes",
      "Ciphertext blobs in process memory, a local file, and the browser session",
    ],
    [
      "Scope, expiry, status, grant epoch, open counters, 120 second ticket nonces",
      "The server's used-nonce set, visitor cookie, and NEAR AI spend counter",
    ],
    [
      "NEP-297 custody events",
      "Support tickets in Redis, when Redis is configured. Those are not the chart.",
    ],
  ],
};

export const DOC_SECTIONS: readonly DocSection[] = [
  {
    id: "judges",
    index: "01",
    kicker: "Start here",
    title: "Judges start here",
    blocks: [
      {
        kind: "p",
        text: "The landing page calls the guided path a 3-minute demo. You play each person. The chart is fictional. Three places are enough to check the entry.",
      },
      {
        kind: "ul",
        items: [
          "[Guided demo](/home?guide=1). Set up Maya, send the referral as Riverbend Family Clinic, approve as Maya after the summary, open as St. Aster Hospital, revoke, then open again and read the refusal.",
          "[Proof log](/onchain?desk=proof). Read the activity for that story. [How we prove it](/start) separates the testnet calls from the demo. [AI check](/verification) shows the summary receipt.",
          `[Explorer](${EXPLORER_ACCOUNT}). This app links testnet.nearblocks.io. Open the contract account, or open a hash from the log. One approve from the attack demo is [B2XvGsCzWiZRkvbg4auKCUFQEnxB96JQUjXUvcai4mUn](https://testnet.nearblocks.io/txns/B2XvGsCzWiZRkvbg4auKCUFQEnxB96JQUjXUvcai4mUn).`,
        ],
      },
      {
        kind: "p",
        text: "Privacy is the primary track. The summary runs in NEAR AI Cloud, and the chain stores hashes and the custody log. Security is the secondary track. Staff sign with function-call keys that cannot consent for the patient.",
      },
    ],
  },
  {
    id: "overview",
    index: "02",
    kicker: "Overview",
    title: "What TendAI Custody does",
    blocks: [
      {
        kind: "p",
        text: "TendAI Custody is a patient-approved referral from a clinic to a hospital. The patient holds the approval. The clinic encrypts the chart before upload. NEAR testnet keeps a chain-of-custody log: who shared which hash, with whom, on what scope, until when, and whether it was opened or revoked.",
      },
      {
        kind: "p",
        text: "Before approving, the patient can read a short summary from NEAR AI Cloud. The server keeps that summary only when the receipt says provider_tee. The enclave writes the summary. It does not re-encrypt the chart for the hospital. The patient's side wraps a data key to the hospital's public key from the contract.",
      },
      {
        kind: "p",
        text: "Revoking stops the next open through this system. It cannot erase a copy that was already downloaded. Removing identifiers for an app copy is best effort, with a preview. This demo is designed around HIPAA principles. All data shown is fictional.",
      },
    ],
  },
  {
    id: "how",
    index: "03",
    kicker: "How it works",
    title: "Actors and the referral flow",
    blocks: [
      {
        kind: "p",
        text: "Four parties show up in a referral. The web app is the fifth piece: it is the Next.js client and server, not a contract role. A second opinion, Northgate Heart Institute in the story, uses the same key shape as the hospital.",
      },
      { kind: "actors" },
      { kind: "flow" },
      {
        kind: "p",
        text: "Section keys are history, meds, labs, imaging, and notes. The patient can grant a subset. A second-opinion share and a transfer are patient create_share calls. A PulseFit copy is a DeidApp share and needs a receipt hash. A hospital consult comes back as submit_reply, which stores a reply hash, not the note.",
      },
    ],
  },
  {
    id: "architecture",
    index: "04",
    kicker: "Architecture",
    title: "Contract, keys, TEE, and the web app",
    blocks: [
      {
        kind: "p",
        text: `The Rust contract crate is referral-relay, version 2.0.0, on near-sdk 5.30.1. Public methods use deny_unknown_arguments. There is no upgrade method and no migration from schema 1. The schema 2 account for this demo is ${CONTRACT_ID}. The owner is ${OWNER_ID}. The NEP-297 standard name is referral_relay and the event version is 2.0.0. The deploy kit records wasm referral_relay.wasm at 278564 bytes, SHA-256 67b2ec90989a2f6b6afbebb1b77061b479c65f787943f82ac0cd61ab478e5d3b.`,
      },
      {
        kind: "p",
        text: "The contract publishes staff_method_names as create_record, request_referral, request_open, request_owner_open, and submit_reply. The keys actually added by the deploy kit are narrower. The clinic key cannot call request_open. The attack demo saw AccessKeyMethodNameMismatchActionError when that key tried.",
      },
      { kind: "table", table: KEY_TABLE },
      {
        kind: "p",
        text: "Encryption is envelope version 1, algorithm x25519-hkdf-sha256+xchacha20poly1305. A random 32 byte data key encrypts the plaintext with XChaCha20-Poly1305. Each recipient gets that key wrapped to their X25519 public key. The associated data binds the record and the section. The SHA-256 of the canonical envelope is what the contract can store as a hash. The encryption context is SHA-256 of the domain referral_relay/v2/context, the contract id, the caller, the method tag, and the 32 byte request id. The same helper lives in contract/src/context.rs and web/lib/near/context.ts.",
      },
      {
        kind: "p",
        text: "The summary and the de-identification model are z-ai/glm-5.3-flash. assertTeeModel refuses any other id, including Incognito model ids, at startup. Completions are non-streaming because the gateway signs streamed bodies by default, and only provider_tee is the signature this app treats as the sealed model. De-identification runs a local scrub, then the TEE pass, then a privacy-filter scan. A leftover identifier or a span scored at least 0.5 blocks the share. The patient sees a preview. The gate does not claim it catches every shape.",
      },
      {
        kind: "p",
        text: "The web app is Next.js 16. It reads the contract with near-api-js and can connect a testnet wallet with @hot-labs/near-connect. In the guided demo, clinic and hospital actions are signed on the server with function-call keys. The patient path on that demo uses the server full-access key. A connected wallet can call self_register_patient on the live contract. If that call fails as method-not-found, the wallet screen says this contract account did not accept self_register_patient.",
      },
    ],
  },
  {
    id: "real",
    index: "05",
    kicker: "Real and simulated",
    title: "What is live, fictional, or only checked in the app",
    blocks: [
      {
        kind: "p",
        text: "Live means a testnet account, a testnet transaction, or a call this demo makes to NEAR AI Cloud. Fictional means the people and the chart. Simulated, in this table, means the product shows a check it did not run, or the chain stores a hash it does not verify.",
      },
      { kind: "table", table: REAL_TABLE },
    ],
  },
  {
    id: "security",
    index: "06",
    kicker: "Security and privacy",
    title: "Threat model, the attack demo, and where data sits",
    blocks: [
      {
        kind: "p",
        text: "The threat model in docs/threat-model.md pairs each risk with a control. Unauthorized opens require the caller to be the recipient or the patient. Revoked and expired shares fail in request_open and check_ticket. Tickets are bound to a nonce hash and last 120 seconds, and the server rejects a replayed nonce. Staff keys are limited by method name, and consent needs 1 yoctoNEAR. Recipient encryption keys are read from the contract. Artifact hashes are checked before decrypt. The summary path requires provider_tee. phi-scan looks for fixture identifiers in contract state and in logs.",
      },
      {
        kind: "p",
        text: "docs/ATTACK-DEMO-RESULT.md is the latest full run: 2026-11-14, 17:05 to 17:06 Bangkok, after rebasing onto 546f5ce, attack share 14, 11 of 11 passed. create_record returned record 8 (EPR5jHDRpxJSLdqCjg9a8EP6d93QKiyeeMgG2doZa2Eg). request_referral returned share 14 (2uJt3QZrsrabGMqkxsptbGaENZSX6dY8cPg7ybegui8t). An unauthorized open returned ERR_UNAUTHORIZED (C5oaSkJTX61yDwc4y6H3wyKdXL1AnPcFrQ8Mbjn5Yi6k). approve_share was accepted (B2XvGsCzWiZRkvbg4auKCUFQEnxB96JQUjXUvcai4mUn). The hospital ticket open was accepted (DxkQ7GPqtr8sX384sKM5vMmuoRFTMk1ARhNkCvYoSUqn). submit_reply returned reply 16 (CrMs24p6wUp3fbLv3PcSkMnkYMEonW4pPMq5o7oTc67Y). revoke_share was accepted (6BUCRw2VQ6xndpbgyLAczDPzrLSZ2EmRcFggMSoyT9HA). The later open panicked ERR_REVOKED (CGaCe4yTiSc5uc9Rtwuc82BFy72bZ5sbdwq8r4QjGf8L). Nonce replay, key substitution, and the flipped ciphertext byte passed with no transaction.",
      },
      {
        kind: "p",
        text: "That run is not a claim that every attack was tried. An earlier pass the same day scored 10 of 11 because the clinic function-call key cannot call request_open. phi-scan on the same contract reported actors=6, records=7, shares=13, events=0, status=complete, schema=2, terms=50, hits=0. Schema 2 has no get_timeline, so events=0 with status=complete is the expected coverage.",
      },
      { kind: "table", table: CHAIN_TABLE },
      {
        kind: "p",
        text: "Known gaps are written down in docs/KNOWN-LIMITS.md. The contract accepts any 64-hex receipt from a transaction signed outside this app. A saved visitor cookie from before a sign can still pass on another instance. The daily NEAR AI budget is not one shared counter across every Vercel instance unless Upstash is configured. Actors are marked active at registration. There is no call that deactivates an actor. create_share checks that a parent share belongs to the same record. It does not check the parent's status. An empty section grant is accepted for DeidApp, and approve_share accepts an empty granted list.",
      },
    ],
  },
  {
    id: "claims",
    index: "07",
    kicker: "Claims",
    title: "Each claim, the file, and the test",
    blocks: [
      {
        kind: "p",
        text: "This is the map for the claims above. Paths are in this repository. Transaction hashes point at the testnet explorer.",
      },
      {
        kind: "table",
        table: {
          caption: "Major claims, the code that implements them, and the test or recorded run that shows them.",
          columns: ["Claim", "Code", "Test or record"],
          rows: CLAIMS.map((row) => [row.claim, row.code, row.test]),
        },
      },
    ],
  },
  {
    id: "contract",
    index: "08",
    kicker: "Contract",
    title: "Public methods and views",
    blocks: [
      {
        kind: "p",
        text: `Account ${CONTRACT_ID} on NEAR testnet. Arguments below are the JSON arguments from contract/src/lib.rs. Hashes and encryption public keys are 64 hex characters (32 bytes). near-sdk U64 values are JSON strings. A JSON object with an unknown field fails to deserialize. Views do not check the caller.`,
      },
      { kind: "methods" },
    ],
  },
  {
    id: "limits",
    index: "09",
    kicker: "Limits",
    title: "Limits and honest caveats",
    blocks: [
      {
        kind: "ul",
        items: [
          "Revoking stops a later open through this system. It cannot erase a copy that was already downloaded.",
          "Removing identifiers is best effort, with a preview. A shape the scrubber and the gate do not know can still pass.",
          "This build is testnet only. It is not mainnet and not a live clinic system.",
          "Fictional data only. Do not load a real patient record.",
          "Designed around HIPAA principles. That is the wording this project uses.",
          "The guided demo keeps signing keys and DEMO_ENC_SEED on the server. Plaintext in the browser does not mean the demo private key stays on the device.",
          "The browser cannot perform the gateway TLS binding check. The contract does not verify a TEE certificate.",
          "Rate limits and the in-memory nonce set are best effort across instances.",
          "rotate_enc_key changes future shares only. Revoking a parent share does not revoke child shares. Use revoke_all_for_record for the epoch.",
          "A lost device key means the clinic re-issues the record. There is no key recovery in this contract.",
          "The root README still describes event version 1.0.0 and the older contract account. Trust the contract source and docs/ATTACK-DEMO-RESULT.md for schema 2.",
          "There is no method that replaces the contract code. Keeping a full-access key on the contract account leaves an upgrade path outside propose_owner. This repository does not delete that key.",
        ],
      },
    ],
  },
  {
    id: "whitepaper",
    index: "10",
    kicker: "Whitepaper",
    title: "Whitepaper",
    blocks: [
      {
        kind: "p",
        text: "The card below reads WHITEPAPER_URL and WHITEPAPER_PDF_URL in web/content/docs.ts. Both are null, so this page does not link a paper and does not offer a PDF.",
      },
      { kind: "whitepaper" },
    ],
  },
  {
    id: "companion",
    index: "11",
    kicker: "Companion",
    title: "Companion entry",
    blocks: [
      {
        kind: "p",
        text: "The same submitter also entered [TrueNav](https://truenav.app) in NEAR HACKATHON. The two projects are independent, with separate code, contracts and deployments, and neither depends on the other.",
      },
    ],
  },
  {
    id: "faq",
    index: "12",
    kicker: "FAQ",
    title: "Questions from a judge, a clinician, or a patient",
    blocks: [{ kind: "faq" }],
  },
];

export function docsPlainText(): string {
  const chunks: string[] = [DOC_TITLE, DOC_DESCRIPTION, CONTRACT_ID, OWNER_ID];
  for (const section of DOC_SECTIONS) {
    chunks.push(section.id, section.title, section.kicker);
    for (const block of section.blocks) {
      if (block.kind === "p") chunks.push(block.text);
      if (block.kind === "ul") chunks.push(...block.items);
      if (block.kind === "table") {
        chunks.push(block.table.caption, ...block.table.columns, ...block.table.rows.flat());
      }
    }
  }
  for (const step of FLOW_STEPS) chunks.push(step.title, step.text, step.actor);
  for (const actor of ACTORS) chunks.push(actor.name, actor.role, actor.does);
  for (const method of CONTRACT_METHODS) chunks.push(method.name, method.args, method.note);
  for (const claim of CLAIMS) chunks.push(claim.claim, claim.code, claim.test);
  for (const item of FAQ) chunks.push(item.question, ...item.answer);
  return chunks.join("\n");
}
