# Threat model

This table is an earlier review list. The current description is [SECURITY.md](../SECURITY.md). Where a row disagrees with the schema 2 contract or with SECURITY.md, use SECURITY.md.

Each row names the control and the test or demo step that shows it. Fictional data only.

| Threat | Control | Test |
| --- | --- | --- |
| Unauthorized reader (random account or another clinic) | `request_open` requires caller == share.to or the patient; envelope wrapped only to recipient keys | sandbox: other account `request_open` fails `ERR_UNAUTHORIZED`; crypto test: decrypt with the wrong key fails; `/api/open` without a ticket is HTTP 403 |
| Revoked reader | status Revoked checked in `request_open` and `check_ticket` | unit and sandbox: revoke then open fails `ERR_REVOKED`; e2e: an unfetched ticket younger than 120 seconds is HTTP 403 `revoked`, and a later `request_open` panics `ERR_REVOKED` |
| Expired share | lazy expiry via block timestamp | unit: timestamp past `expires_at_ns` fails `ERR_EXPIRED`; sandbox: `fast_forward` then open fails `ERR_EXPIRED` |
| Replay of a ticket or nonce | nonce hash bound to (share, account), 120 second TTL; server used-nonce set | unit: `check_ticket` window; sandbox: fast-forward; `web/lib/open/handle.test.ts`: replayed nonce is HTTP 403 |
| Staff key overreach | function-call method list; 1 yoctoNEAR on consent and revoke | unit: `approve_share` with 0 deposit panics; sandbox: function-call key call to `approve_share` fails and the share stays `Requested` |
| Key substitution by server | recipient encryption keys are read from the contract, not from the server | `recipientPublicKey` keeps the on-chain key and warns when a server-offered key differs |
| Envelope swap (B's envelope served for another share) | AAD binds record id and section; on-chain artifact hash is checked before decrypt | crypto test: AAD swap fails; `web/lib/relay/keys.test.ts`: a swapped envelope hash is rejected |
| Forged or stale attestation | SDK verification with a fresh nonce; require `provider_tee` before approve | panel unit test: throw or `gateway` is red; live e2e requires `signatureKind=provider_tee` |
| Model not in TEE | allowlist of the NEAR TEE model id; refuse Incognito models | `assertTeeModel` throws on `openai/*` at startup |
| PHI on-chain | only ids, coarse kind, hashes, timestamps, and org-level actor names | `scripts/phi-scan.ts` dumps state, timeline, and recorded transactions and finds zero fixture identifiers |
| PHI in server logs | proxy and TEE routes log method, status, and timing only | `scripts/phi-scan.ts` greps the e2e log and server logs for fixture identifiers |
| PHI in our server | E2EE to the model; only de-identified text would go to privacy-filter; blobs are ciphertext | proxy is a forwarder. De-identification in this commit is local only (`web/lib/deid`) and is not sent anywhere |
| Leak in de-id output | deterministic scrub, TEE pass, privacy-filter scan, block on a hit | pipeline tests block on a leftover identifier and on a span at 0.5; live e2e runs the TEE pass before `DeidApp` |
| Storage-cost spam | only owner-registered actors write; length caps | unit and sandbox: unregistered `create_record` fails `ERR_NOT_REGISTERED` |
| Secrets in repo | `.env` gitignored; `.env.example` has empty values | no keys are committed |

## Security checklist notes

Reviewed against https://docs.near.org/smart-contracts/security/checklist and https://docs.near.org/smart-contracts/security/one_yocto.

- Every change method checks `predecessor_account_id`. Views do not authorize.
- There are no callbacks and no cross-contract calls. Nothing is marked `#[private]` because nothing is a callback.
- `approve_share`, `decline_share`, `create_share`, `revoke_share`, and `revoke_all_for_record` are `#[payable]` and call `assert_one_yocto`.
- String lengths, section counts, and page sizes are capped. Duplicate section keys are rejected.
- `overflow-checks = true` in the release profile. Counters use `checked_add`.
- The 1 yoctoNEAR deposit is kept by the contract. It is the key-type proof from the one-yocto page, not a fee, and it is not refunded.
- Storage is paid by the contract account. Writes require an owner-registered actor, which is the plan's answer to a storage-griefing attack. Users do not attach a storage deposit.
- `block_timestamp` is used for expiry and ticket age, not as a random source.
- No upgrade method is shipped. There is nothing to migrate yet.
