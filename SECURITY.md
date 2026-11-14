# Security

This note is for hackathon judges and security reviewers. TendAI Custody is a NEAR hackathon entry. The primary track is privacy. The secondary track is security. It runs on NEAR testnet with fictional data only. It is designed around HIPAA principles: patient authorization, minimum necessary, and an access log.

The live contract is `rr191f8afd-contract.testnet`, schema 2. The owner view returns `rr191f8afd-owner.testnet`. The wasm on that account is 278,564 bytes, SHA-256 `67b2ec90989a2f6b6afbebb1b77061b479c65f787943f82ac0cd61ab478e5d3b`, code hash `7yoEaxs7NvbbHSAw6wY91M1eMV488DocVXyBN5bQaxcz`. Limits that stay visible are also in [docs/KNOWN-LIMITS.md](docs/KNOWN-LIMITS.md). The attack demo on this schema 2 contract is [docs/ATTACK-DEMO-RESULT.md](docs/ATTACK-DEMO-RESULT.md): 11 of 11 on 2026-11-14.

The contract account still has one full-access key (`view_access_key_list`, 2026-11-14). That key can deploy new code. This repository does not delete it (`contract/DESIGN-V2.md`). `POST /api/tee/summary` receives chart text in the request body before the server sends that text to NEAR AI Cloud. The handler does not store that text.

## Routes on this tree

Checked against `main` `3384551`. That commit adds the page `/docs`. It does not add an API route. There is no `web/app/api/nearai` route. `web/lib/http/nearai-proxy.ts` returns HTTP 404 and does not forward a body.

| Route | Role |
| --- | --- |
| `POST /api/sign` | Signs the allowlisted methods with the role key in `web/lib/near/sign-handler.ts`. |
| `PUT /api/blob`, `GET /api/blob` | Stores and reads ciphertext. |
| `POST /api/open` | Checks the ticket, then can decrypt a demo envelope with `DEMO_ENC_SEED`. |
| `POST /api/tee/summary` | Live summary. Sees chart text. Keeps it only for `provider_tee`. |
| `POST /api/tee/deid` | De-identification of the built-in fixture. |
| `POST /api/tee/live` | Fixed fictional chart. |
| `POST /api/assist` | Ask TendAI. |
| `GET /api/status`, `GET /api/demo/config` | Public status and demo account ids. |
| `POST /api/visitor/challenge`, `POST /api/visitor/start`, `POST /api/visitor/demo`, `POST /api/visitor/bind`, `POST /api/visitor/sign-out`, `GET /api/visitor` | Session and optional faucet. |
| `POST /api/support`, `POST /api/support/challenge`, `POST /api/support/admin` | Support tickets. |
| `POST /api/dev/selftest`, `POST /api/dev/attack-demo` | HTTP 404 unless `VERCEL_ENV` is `preview`. |

Pages a judge opens with no key: `/`, `/home?guide=1`, `/onchain?desk=proof`, `/start`, `/docs`.

## Threat model

Actors:

| Actor | What they can do in this demo |
| --- | --- |
| Patient | Approve, decline, create a share, and revoke. The hosted signer is `DEMO_PATIENT_PRIVATE_KEY`. Those methods require exactly 1 yoctoNEAR. |
| Clinic (Riverbend) | `create_record` and `request_referral` with `CLINIC_A_FC_PRIVATE_KEY`. |
| Hospital (St. Aster) | `request_open` and `submit_reply` with `HOSPITAL_B_FC_PRIVATE_KEY`. The contract stores this account as role Clinic. |
| Second opinion (Northgate) | `request_open` and `submit_reply` with `SECOND_OPINION_FC_PRIVATE_KEY`. Role Clinic on chain. |
| PulseFit | `request_open` with `PULSEFIT_FC_PRIVATE_KEY`. Role App. |
| Lakeside | A function-call key for `create_record` and `request_referral`. The web signer has no Lakeside role. |
| Owner | `register_actor` and the owner-transfer methods. The hosted app does not read `RELAY_OWNER_PRIVATE_KEY`. |
| NEAR AI Cloud | Writes the summary and the de-identified text. It does not wrap keys for the hospital. |
| Contract account | One full-access key remains on `rr191f8afd-contract.testnet` (`view_access_key_list`, 2026-11-14). That key can deploy new code. This repository does not delete it (`contract/DESIGN-V2.md`). |

Assets:

- Fictional chart text and the summary.
- Data keys inside envelopes (`web/lib/crypto/envelope.ts`).
- Testnet signing keys. The hosted app holds function-call keys for staff and PulseFit, the patient full-access key, `DEMO_ENC_SEED`, and `NEARAI_API_KEY`.
- The custody record: ids, hashes, scope, expiry, status, and organization display names.

Trust boundaries:

| Boundary | What crosses it |
| --- | --- |
| Browser to Next.js server | Encrypted section bytes, the fictional chart for the summary call, and sign requests. The sign route rebuilds arguments from an allowlist (`web/lib/near/sign-allow.ts`). The request cannot choose an account id. |
| Server to NEAR testnet | Transactions from the role signer in `web/lib/near/sign-handler.ts` `SIGNER_ENV`. |
| Server to NEAR AI Cloud | Chart text for the summary, and already-scrubbed text for the privacy filter. The chat path uses the SDK with `e2ee: true` (`web/lib/tee/live.ts`). |
| Chain to everyone | Account ids, display names, hashes, scope, expiry, status, counters, and NEP-297 events. Chart text is not a contract field. |

What the design defends, and the test that shows it:

| Threat | Control | Test or check |
| --- | --- | --- |
| Stranger opens a share | `request_open` allows the recipient or the patient (`contract/src/lib.rs`) | `unauthorized_open_is_rejected`. Attack demo case `unauthorized open`. |
| Open after revoke or expiry | `assert_share_openable` panics `ERR_REVOKED` or `ERR_EXPIRED` | `revoke_then_open_fails`, `lazy_expiry_blocks_open`. Refused open [CGaCe4yTiSc5uc9Rtwuc82BFy72bZ5sbdwq8r4QjGf8L](https://testnet.nearblocks.io/txns/CGaCe4yTiSc5uc9Rtwuc82BFy72bZ5sbdwq8r4QjGf8L). |
| Staff key approves for the patient | Clinic, hospital, second opinion, and PulseFit keys omit the consent methods. `sandbox_custody_rules` adds a function-call key without `approve_share`. The call fails and the share stays `Requested`. | `contract/tests/sandbox.rs` `sandbox_custody_rules` |
| Forged summary receipt through this app | `approve_share` must present a receipt this server issued for the session, share id, and summary hash. Single use. 10 minutes. | `M1 the server summary hash is canonical and approve rejects any other 64-hex receipt` |
| Replay of an open nonce | The server records the nonce before the first await. A repeat is HTTP 403 `replay`. The contract does not consume the nonce. `check_ticket` is true only while the share is active, the nonce matches, and the ticket is at most 120 seconds old. | `replayed nonce gives 403` |
| Swapped or flipped ciphertext | The open path checks the sha256 against the artifact hash on the contract. AAD binds the section. | `AAD swap fails`, `presented ciphertext for a different hash is not released` |
| Summary from outside the TEE | `teeSummary` throws unless `signatureKind` is `provider_tee`. Startup refuses any other model id. | `a missing provider_tee receipt and a short answer are not retried`, `assertTeeModel` in `web/lib/relay/policy.ts` |
| Fixture identifiers on chain or in logs | `scripts/phi-scan.ts` reads actors, records, shares, and the e2e log. | The count is in the README test table. |
| Caller-supplied NEAR AI proxy | `web/lib/http/nearai-proxy.ts` `handleNearAi` returns HTTP 404 and does not read the session secret. | The route file is the handler. There is no `web/app/api/nearai` route. |

## On chain and off chain

On chain (`contract/src/lib.rs`, `contract/src/events.rs`):

- Actor account id, role, display name, encryption public key, active flag, key version.
- Record id, patient, creating clinic, five section-hash slots, grant epoch, share count, open count, last open time.
- Share id, kind, parties, requested and granted section masks, purpose hash, artifact hash, TEE receipt hash, read-only flag, expiry, status, open count.
- One open ticket slot per party, nonce hash and timestamp, 120 second window (`TICKET_TTL_NS`).
- NEP-297 events, standard `referral_relay`, version `2.0.0`.

Off chain:

- Chart plaintext in the browser and, for the summary call, in the request body of `POST /api/tee/summary`. The handler does not write that text to the blob store. The log line is status and timing (`web/lib/tee/summary-error.ts`).
- Ciphertext envelopes. `PUT /api/blob` stores bytes (`web/lib/blob/store.ts`). The browser also keeps them in session storage and sends them again on open.
- The summary text, returned to the browser that requested it.
- Demo session cookie `rr_visitor` (`web/lib/session/visitor.ts`): session id, record ids, share ids, receipt hashes, patient account id. It does not hold chart text. A summary receipt in that cookie expires after 10 minutes.

`try_decode_hash` accepts any 64 hex characters (`contract/src/lib.rs`). A transaction signed outside this app can store a receipt the server never issued. The app binding is described above.

## Encryption and keys

Envelope format is version 1, `x25519-hkdf-sha256+xchacha20poly1305` (`web/lib/crypto/envelope.ts`).

`sendClinicReferral` in `web/lib/relay/flow.ts` encrypts each selected section in the browser. Recipients are the patient public key and the clinic public key read from the contract. The hospital is not on that envelope. The purpose text is encrypted to the patient key. The contract stores `cipher_hash` values.

`approveReferral` in the same file seals a new envelope of the granted section text to the hospital public key and the patient public key from the contract. That hash is `artifact_hash` on `approve_share`. This path calls `encryptEnvelope`. It does not call `rewrapEnvelope`.

`rewrapEnvelope` unwraps the data key for one recipient and wraps that same key for a new recipient list. The ciphertext bytes stay the same. The test `re-wrap to a second recipient works` covers that function. The Guided Demo approve path does not use it.

The TEE writes the summary and the de-identified copy. `teeSummary` checks `provider_tee` before the text is returned. `POST /api/tee/deid` runs the scrubber, a TEE pass, and a privacy-filter call. The filter is a plaintext POST of the post-scrub text to `https://cloud-api.near.ai/v1/privacy/classify` (`web/lib/tee/live.ts`). The chat path is the E2EE SDK call. The filter is not.

`DEMO_ENC_SEED` derives the demo X25519 keys (`web/lib/crypto/actor-key.ts`). `POST /api/open` can decrypt a demo envelope with that seed. The Guided Demo therefore does not keep the encryption secret only on the patient device.

A separate device-key path stores a secret in IndexedDB `tendai-demo-key`. The test `a device key stays off the public view and signs without sending the secret` checks that the request does not include the secret.

`rotate_enc_key` changes the caller's public key for later shares. It is self-only. The owner has no method that writes a patient's key (`contract/DESIGN-V2.md`). The test `roles_stay_fixed_and_rotation_is_self_only` covers the contract rule.

## Function-call keys

Hosted signers (`web/lib/near/sign-handler.ts`):

| Role | Env name read for the secret | Deposit |
| --- | --- | --- |
| clinic | `CLINIC_A_FC_PRIVATE_KEY` | 0 |
| hospital | `HOSPITAL_B_FC_PRIVATE_KEY` | 0 |
| second | `SECOND_OPINION_FC_PRIVATE_KEY` | 0 |
| app (PulseFit) | `PULSEFIT_FC_PRIVATE_KEY` | 0 |
| patient | `DEMO_PATIENT_PRIVATE_KEY` | 1 yoctoNEAR on approve, decline, create_share, revoke_share, revoke_all_for_record |

`POST /api/sign` signs `create_record`, `request_referral`, `approve_share`, `decline_share`, `create_share`, `request_open`, `submit_reply`, `revoke_share`, and `revoke_all_for_record`. Unknown methods and unknown argument keys are HTTP 400. The account id comes from the server env for that role.

On-chain method lists, `view_access_key_list` on 2026-11-14, receiver `rr191f8afd-contract.testnet`:

| Account | Methods |
| --- | --- |
| `rr191f8afd-clinic.testnet` | `create_record`, `request_referral` | <!-- pragma: allowlist secret -->
| `rr191f8afd-hospital.testnet` | `request_open`, `submit_reply` | <!-- pragma: allowlist secret -->
| `rr191f8afd-second.testnet` | `request_open`, `submit_reply` |
| `rr191f8afd-lakeside.testnet` | `create_record`, `request_referral` |
| `rr191f8afd-pulsefit.testnet` | `request_open` |
| `rr191f8afd-patient.testnet` | `approve_share`, `decline_share`, `create_share`, `revoke_share`, `revoke_all_for_record` | <!-- pragma: allowlist secret -->

The patient function-call key is on the account. The hosted signer does not use it. Consent methods call `assert_one_yocto`. The contract module docs say a function-call key cannot attach that deposit. The hosted patient transactions in the README claim map were signed by the patient account and attached 1 yoctoNEAR, which matches `DEMO_PATIENT_PRIVATE_KEY`.

`request_owner_open` exists for the patient or the clinic that created the record. The sign allowlist does not include it. The clinic function-call key on testnet does not list it.

Names ending in `_FULL_PRIVATE_KEY`, and `RELAY_OWNER_PRIVATE_KEY`, are for local tooling. No Production or Preview code reads them. As of 2026-11-14 they are off Production and Preview. They remain for local tooling and Development only. The test `app code never reads the PulseFit full-access key` walks the repo and expects `PULSEFIT_FULL_PRIVATE_KEY` only in `scripts/pulsefit-fc-key.ts` and `scripts/setup-testnet.ts`. The test `the attack runner source does not sign with the owner key` checks that `web/lib/dev/attack-checks.ts` does not name `RELAY_OWNER_PRIVATE_KEY`.

Those accounts still have full-access keys on testnet. The hosted app does not load those secrets. A copy of a full-access secret can still sign anything that account can do. The contract account's full-access key can still deploy code.

## Consent and revocation

`approve_share`, `decline_share`, `create_share`, `revoke_share`, and `revoke_all_for_record` are payable and call `assert_one_yocto`. The 1 yoctoNEAR stays on the contract. It is the consent signal. It is not a fee and it is not refunded (`contract/DESIGN-V2.md`).

`approve_share` requires the patient, status `Requested`, the current grant epoch, and a granted set that is a subset of the request. It stores the artifact hash and the receipt hash and emits `share_consented` and `share_transformed`.

`revoke_share` sets that share to `Revoked`. It does not revoke children. It does not delete ciphertext.

`revoke_all_for_record` requires the current epoch, increments it, and emits one `record_grants_revoked` event. Older shares fail later opens with `ERR_REVOKED` because the epoch no longer matches. The call does not walk the shares.

A revoked share cannot be resurrected by replaying the original request id (`replay_after_revoke_does_not_resurrect`).

Revoke blocks a later open through this system. A file already downloaded is outside the contract.

## Attack demo

`pnpm attack-demo` (`scripts/attack-demo.ts`) on 2026-11-14, recorded in [docs/ATTACK-DEMO-RESULT.md](docs/ATTACK-DEMO-RESULT.md). 11 of 11 passed. Fictional payloads. No deploy. The suite was not re-run. The refused open was re-read on RPC.

| Case | Result | Where |
| --- | --- | --- |
| create_record | pass, record 8 | [EPR5jHDRpxJSLdqCjg9a8EP6d93QKiyeeMgG2doZa2Eg](https://testnet.nearblocks.io/txns/EPR5jHDRpxJSLdqCjg9a8EP6d93QKiyeeMgG2doZa2Eg) |
| request_referral | pass, share 14 | [2uJt3QZrsrabGMqkxsptbGaENZSX6dY8cPg7ybegui8t](https://testnet.nearblocks.io/txns/2uJt3QZrsrabGMqkxsptbGaENZSX6dY8cPg7ybegui8t) |
| unauthorized open | `ERR_UNAUTHORIZED` | [C5oaSkJTX61yDwc4y6H3wyKdXL1AnPcFrQ8Mbjn5Yi6k](https://testnet.nearblocks.io/txns/C5oaSkJTX61yDwc4y6H3wyKdXL1AnPcFrQ8Mbjn5Yi6k) |
| approve | pass, 1 yoctoNEAR | [B2XvGsCzWiZRkvbg4auKCUFQEnxB96JQUjXUvcai4mUn](https://testnet.nearblocks.io/txns/B2XvGsCzWiZRkvbg4auKCUFQEnxB96JQUjXUvcai4mUn) |
| ticket open | pass | [DxkQ7GPqtr8sX384sKM5vMmuoRFTMk1ARhNkCvYoSUqn](https://testnet.nearblocks.io/txns/DxkQ7GPqtr8sX384sKM5vMmuoRFTMk1ARhNkCvYoSUqn) |
| nonce replay | first HTTP 200, second HTTP 403 `replay` | Local. No transaction. |
| key substitution | Server-offered key that differs from the chain directory is not used | Local. `recipientPublicKey` in `web/lib/relay/keys.ts`. |
| envelope swap | One flipped ciphertext byte is rejected | Local. |
| consult reply | pass, reply 16 | [CrMs24p6wUp3fbLv3PcSkMnkYMEonW4pPMq5o7oTc67Y](https://testnet.nearblocks.io/txns/CrMs24p6wUp3fbLv3PcSkMnkYMEonW4pPMq5o7oTc67Y) |
| revoke | pass, 1 yoctoNEAR | [6BUCRw2VQ6xndpbgyLAczDPzrLSZ2EmRcFggMSoyT9HA](https://testnet.nearblocks.io/txns/6BUCRw2VQ6xndpbgyLAczDPzrLSZ2EmRcFggMSoyT9HA) |
| revoked open | `ERR_REVOKED` | [CGaCe4yTiSc5uc9Rtwuc82BFy72bZ5sbdwq8r4QjGf8L](https://testnet.nearblocks.io/txns/CGaCe4yTiSc5uc9Rtwuc82BFy72bZ5sbdwq8r4QjGf8L). Re-read on RPC. |

The production retest hashes in the README are a later path on the same contract (record 9, share 17). They are not the attack-demo rows.

## Known limitations

- Revoke cannot erase a downloaded copy. The blob helper has no delete (`web/lib/blob/store.ts`).
- De-identification is best effort, with a preview. The gate covers the shapes in its tests (`web/lib/deid/identifier-gate.test.ts`). A shape those tests do not cover can still pass.
- The contract stores any 64-hex receipt. The server binding lives in the session cookie and in the instance that signed. A saved cookie from before the sign can still pass on another instance. Summary receipts keep the last 4. De-id pairs keep the last 8 (`docs/KNOWN-LIMITS.md`).
- Rate limits are best effort across instances. `web/lib/guard/visitor.ts` sets `IP_LIMIT` to 24 calls in 10 minutes and `AI_DAY_LIMIT` to 300 per UTC day. The runtime cache is regional. A missed read is filled for that instance.
- The privacy-filter call sees the post-scrub text. It is not the E2EE chat path.
- `create_share` checks that a parent share is on the same record. It does not check the parent's status or kind (`contract/src/lib.rs`).
- The contract accepts an empty granted mask (`subset_mask`). The sign route requires 1 to 5 section names for `approve_share` (`web/lib/near/sign-allow.ts`). `DeidApp` may be created with an empty section list.
- Actors are marked active at registration. There is no deactivate method.
- `list_pending_for_patient` reads that patient's pending index, capped at 50. It does not walk every record.
- An owner call can store a personal name beside an organization token. The contract rejects the listed tokens. It does not reject every personal name (`clean_name` in `contract/src/lib.rs`).
- The contract account still has a full-access key, so the wasm can be replaced by whoever holds that key. Owner transfer (`propose_owner`, `accept_owner`) does not remove it.
- Full-access keys remain on the actor accounts. The hosted app does not load the `_FULL_PRIVATE_KEY` secrets or `RELAY_OWNER_PRIVATE_KEY`.
- Testnet only. `.env.example` sets `NEAR_NETWORK=testnet`.
- Fictional data only. `POST /api/tee/deid` uses the built-in fixture.
- `near-sdk` is pinned with `default-features = false` so the contract build does not link `wee_alloc` (`contract/Cargo.toml`). An OSV query was not re-run. Older notes that count affected packages are not repeated here.
- Before a contract upgrade, a live state dump is checked against the new wasm. `scripts/phi-scan.ts` reads the public actors, records, and shares. No wasm was deployed for this document.

## Secrets

Secrets belong in environment variables. `.env` is gitignored. `.env.example` has empty values. The hosted app reads function-call keys for clinic, hospital, second opinion, and PulseFit, plus `DEMO_PATIENT_PRIVATE_KEY`, `DEMO_ENC_SEED`, `DEMO_SESSION_SECRET`, and `NEARAI_API_KEY`.

`CLINIC_A_FULL_PRIVATE_KEY`, `HOSPITAL_B_FULL_PRIVATE_KEY`, `SECOND_OPINION_FULL_PRIVATE_KEY`, `LAKESIDE_FULL_PRIVATE_KEY`, `PULSEFIT_FULL_PRIVATE_KEY`, and `RELAY_OWNER_PRIVATE_KEY` are for local tooling. Production and Preview code does not read them. As of 2026-11-14 they are off Production and Preview. They remain for local tooling and Development only.

`RR_SELFTEST_TOKEN` is for Preview. `POST /api/dev/selftest` returns HTTP 404 unless `VERCEL_ENV` is `preview` (`selftest is 404 outside preview, including production`).

Do not commit key files, `.env`, or credential directories. `.gitignore` lists `.env`, `*.pem`, `*.key`, and NEAR credential directories.

## Reporting a vulnerability

Open a private GitHub security advisory on this repository:

https://github.com/TendAILabs/TendAI-NEAR/security/advisories/new

Include what you ran, the commit, and the effect. Do not include secrets or tokens. There is no email address for reports in this repository.
