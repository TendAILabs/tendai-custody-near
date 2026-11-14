# Known limits

TendAI Custody follows health-privacy principles in the design of this demo. This file lists what the demo does not do.

## RR-06 receipt

The Rust contract still stores any 64-hex receipt when a transaction is signed outside this app. `try_decode_hash` checks length and hex digits only (`contract/src/lib.rs`). The server-issued binding is enforced by the app server, not on-chain. An on-chain issued set would need a contract upgrade. The contract was not redeployed.

The app stores each de-id receipt together with the artifact hash it sealed, and that pair is removed after `create_share` uses it. A new seal of the same text gets a new artifact hash and can be used once. The earlier pair stays spent. The spent mark is in the visitor cookie and in the instance that signed. A saved copy of the cookie from before the sign can still pass on another instance. The issued list keeps the last 8 pairs so the cookie stays within a browser limit. Records and shares keep the last 50.

`approve_share` requires a summary receipt that `POST /api/tee/summary` issued for that session, that share id, and that summary hash. The receipt is single-use and expires after 10 minutes. A forged 64-hex value is HTTP 403 and does not remove the issued receipt. The summary list keeps the last 4. A saved copy of the cookie from before the sign can still pass on another instance, for the same reason as the de-id pair.

## Full-access keys and PulseFit

The hosted app signs PulseFit `request_open` with `PULSEFIT_FC_PRIVATE_KEY` (`web/lib/near/sign-handler.ts`). On `rr191f8afd-pulsefit.testnet` that function-call key lists only `request_open` on `rr191f8afd-contract.testnet`. A missing name returns HTTP 500 `signer not configured`. The call attaches no deposit.

`CLINIC_A_FULL_PRIVATE_KEY`, `HOSPITAL_B_FULL_PRIVATE_KEY`, `SECOND_OPINION_FULL_PRIVATE_KEY`, `LAKESIDE_FULL_PRIVATE_KEY`, `PULSEFIT_FULL_PRIVATE_KEY`, and `RELAY_OWNER_PRIVATE_KEY` are for local tooling. Production and Preview code does not read them. As of 2026-11-14 they are off Production and Preview. They remain for local tooling and Development only.

The hosted patient signer is `DEMO_PATIENT_PRIVATE_KEY`, a full-access key, because consent attaches 1 yoctoNEAR. The actor accounts still have full-access keys on testnet. The hosted app does not load the `_FULL_PRIVATE_KEY` secrets. `docs/runbooks/pulsefit-fc-key.md` describes the previous contract `rr6c9910d7.testnet`.

## Contract lows still open

These stay in `contract/`. That code is unchanged.

- `list_pending_for_patient` reads that patient's pending index. The page limit is 50. It does not walk every record (`contract/src/lib.rs`).
- `create_share` checks that a parent share belongs to the same record. It does not check the parent's status or kind.
- An empty section grant is accepted. `DeidApp` may be created with an empty section list, and `approve_share` accepts an empty granted list.
- Actors are marked active when they register. There is no call that deactivates an actor.
- `near-sdk` is pinned with `default-features = false`, so the contract build does not link `wee_alloc` (`contract/Cargo.toml`). This note does not repeat an OSV count. The last scan was not re-run here.

## RR-09 name beside an org token

A personal name next to an organization token can still be stored by an owner call. The app blocks the names it knows. The contract does not reject every personal name.

## RR-05 daily budget

The daily budget is not shared across Vercel instances. Each instance keeps its own count and a best-effort Runtime Cache value. There is no compare-and-swap, so two instances can each admit the cap.

## RR-04 limiter

The app limiter is best effort. It counts the client IP calculated by the Vercel proxy. Sign calls and NEAR AI calls keep separate windows and separate day counters. Each kind allows 24 calls in 10 minutes per address, and 300 calls per UTC day. Blob uploads count toward the sign window. The Runtime Cache is regional and ephemeral, and a missed read is filled in only for that instance. The edge firewall is a separate limit and can deny a call this counter has not seen.

## Revoke

Revoking a share stops a later open. It cannot erase a copy that was already downloaded.

## Ciphertext copies

The de-id route sets its own max duration, so Vercel runs it as a separate function from `/api/open`. A ciphertext file written in that function is not visible to the open route, on the same host or another. The browser that sealed the copy keeps those bytes and sends them on open. The open route releases them only when the sha256 matches the hash on the contract. The bytes are ciphertext. A browser that does not still hold them gets a plain message and can send the copy again. There is no shared ciphertext store on the project.

## De-identification

De-identification is best effort, with a preview. The gate and the scrubber catch the shapes covered by their tests. A shape they do not know can still pass, and the summary card says the identifier check is best effort.

## Demo keys

In this demo the encryption keys are seeded on the server. Plaintext handling in the browser does not mean the private key stays on the device.

## NEAR AI spend stop

The $4 stop counts integer micro-USD. A reservation is added first and removed again when that reservation would pass $4, so the next call is refused. With Upstash configured, `INCRBY` does that across instances. Without Upstash, the same steps run in memory for one process, and each process has its own total. The total can pass $4 by at most one call's overage. The NEAR AI account balance is the hard stop.
