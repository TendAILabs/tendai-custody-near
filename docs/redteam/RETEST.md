# TendAI Custody retest

Independent retest of draft PR #19. The reviewer did not write the fixes. The product is designed around HIPAA principles. De-identification here is best effort. This report does not claim the demo has no remaining weaknesses.

The author of the fixes does not close a High or Critical finding. The verdicts below are from this retest.

| Item | Value |
| --- | --- |
| Repo | Development repo of this project |
| Fix commit | `212c461a` (`212c461add86e0b53c1627e33aef2550b32d2d31`), branch `cursor/redteam-fixes-3f0c` |
| Diff base | `12fecbbf` (`12fecbbf2aec5814426b59988fcbf7054fdfeff7`), `main` |
| When | 2026-11-11, about 10:43 to 11:00 Bangkok (UTC+7) |
| App under test | local `next start` of a production build of `web/` at that commit, then the preview named below |
| Preview | https://tendaicustody.app (public origin). The temporary preview host used on 2026-11-11 is omitted. Commit `212c461a`. |
| Contract runtime | near-sdk 5.30.1 mock runtime. Not near-sandbox. rustc 1.99.1 |
| Node | v22.23.4. Next.js 16.4.5. pnpm 10.15.0 |
| Data | fictional only. The local server used the synthetic seed from `docs/redteam/repros/http-attacks.mjs` and a random session secret that is not recorded here. Signing keys were the canary string, which fails base58 parsing before a broadcast. No mainnet call |

## Diff review

`git diff --stat 12fecbbf...212c461a`: 28 files, 676 insertions, 193 deletions. One commit: `212c461 Fix the nine red-team findings and record the gate.`

No `it.skip`, `test.skip`, `describe.skip`, or `#[ignore]` was added. No existing test file was deleted.

Assertions that described the old unsafe behavior were replaced with assertions that the new check refuses it:

- `web/lib/deid/pipeline.test.ts`: the old test expected `ok: true` with no TEE client. It now expects `ok: false` at stage `tee`. The check that clinical text remains moved out of this test. Variant coverage lives in `web/lib/redteam/findings.test.ts`. That file does not include the extra fictional name or the extra fictional phone.
- `docs/redteam/repros/contract-mock/tests/attacks.rs`: `deid_share_does_not_require_a_tee_receipt` was renamed and now expects `ERR_NO_RECEIPT`. `owner_can_store_a_patient_style_display_name` now expects `ERR_BAD_NAME`. The success assertions were removed because the calls panic.
- `web/lib/guard/visitor.test.ts`: signing now counts toward the daily cap. That is stricter. The IP tests match the new bucket rule.
- `contract/tests/sandbox.rs` and `scripts/e2e-cli.ts` pass a 64 hex receipt so a `DeidApp` share still runs. The e2e script uses the artifact hash as that receipt.

The original mock suite still passes: `cargo +1.99.1 test --manifest-path docs/redteam/repros/contract-mock/Cargo.toml` reported 22 passed in `attacks.rs`, 0 failed, 0 ignored. The new file `retest_bypass.rs` added 4 passed tests. The near-sandbox test in `contract/tests/sandbox.rs` was not rerun.

## Verdicts

| ID | Severity | Retest verdict |
| --- | --- | --- |
| RR-01 | Critical | closed |
| RR-02 | High | closed |
| RR-03 | Medium | closed |
| RR-04 | Medium | partially fixed |
| RR-05 | Medium | partially fixed |
| RR-06 | Medium | partially fixed |
| RR-07 | Medium | partially fixed |
| RR-08 | Low | closed |
| RR-09 | Info | partially fixed |

## RR-01. Demo config returns every actor encryption secret

Verdict: closed.

`GET /api/demo/config` on local `next start` returned HTTP 200 with keys `contractId` and `accounts` only. `hex64` was false, `returnedSecretMatchesSeed` was false, and `decryptRoundtrip` was false. The same shape was returned for `?enc=1&secrets=1`. POST was HTTP 405.

Other routes checked on that server: `/api/status`, `/api/open`, `/api/sign` (bad JSON and anonymous revoke), `/api/tee/summary`, `/api/tee/deid`, `/api/tee/live`, `/api/nearai/v1/chat/completions`, `/api/blob`, and a missing path. None of the bodies contained the synthetic seed, the session secret, the canary, an `ed25519:` secret, or the patient secret derived from the seed. `web/.next/static` had 66 files and 0 hits for those names or for the seed.

`GET /api/nearai/v1/attestation/report` returned HTTP 200 with a public gateway attestation. That body has long hex and the word ed25519 as an algorithm name. It did not contain the derived patient secret or the seed. A local listener on 127.0.0.1 received 0 hits from the proxy paths.

Remaining risk: each browser generates five X25519 secrets and stores them in `sessionStorage`. That is RR-10 below. The server seed is not in the response.

Repro:

```text
NODE_PATH=web/node_modules node --experimental-strip-types docs/redteam/repros/http-attacks.mjs http://127.0.0.1:3210
NODE_PATH=web/node_modules node --experimental-strip-types docs/redteam/repros/retest-http.mjs http://127.0.0.1:3210
```

The second command needs `DEMO_ENC_SEED` and `DEMO_SESSION_SECRET` in the environment, the same values as the server. It prints booleans, not the values.

## RR-02. `/api/sign` signs as the patient with no caller check

Verdict: closed.

On a fresh local process, before the per-IP bucket filled:

- Anonymous `revoke_share` for share `999999`, the original body, returned HTTP 401 `sign in required`.
- A garbage cookie, a flipped HMAC, an empty signature, and an HMAC under the wrong secret were HTTP 401.
- A valid cookie whose share list does not include `4` got HTTP 403 `not this session` for `revoke_share` and for `create_share` of record `3`.
- `share_id` sent as a number, and as an array, was HTTP 403.
- A cookie minted with the server secret and share `4` in the list reached the signer: HTTP 400 `sign failed`. The canary was not in the body. The key parser throws before a broadcast. Replaying that cookie did not add rights.
- `register_actor` stayed HTTP 403.
- `GET /api/demo/config` reused a valid cookie's session id. A planted invalid cookie was rejected and a new session id was issued.

The original `http-attacks.mjs` run does not show the 401. Its IP section admits 24 calls into the single local bucket, so the later sign lines are HTTP 429 from the rate limit. The auth result above is from `retest-http.mjs` on a restarted process.

Remaining risk: any fresh cookie is allowed to attempt `create_record`. With the canary key that attempt is HTTP 400 `sign failed`. A real clinic key would broadcast. After a successful `create_record`, that same cookie can pass the patient methods for the record it just created. That is the guided demo, and it is not a cross-session revoke. A stolen cookie still works until it expires (12 hours). The server still holds the patient key. This retest did not forge a cookie without the secret.

Repro: the `sign-patient-revoke` line of `http-attacks.mjs` on a process whose local bucket is already full, then `retest-http.mjs` on a fresh process for the 401 and 403 lines.

## RR-03. Blob download skips the ticket gate

Verdict: closed.

`PUT` of `fictional-ciphertext-envelope-v1` returned HTTP 201 and a hash, not the bytes. `GET` of that hash with no ticket returned HTTP 403, and the body was not the plaintext. A fake ticket, and `HEAD`, were HTTP 403. `hash=../.env` was HTTP 400. A 1,000,001 byte upload was HTTP 400. `/.data/blobs/<hash>` and `/data/blobs/<hash>` were HTTP 404.

`PUT` is still unauthenticated. That was not the original finding.

Repro: the `blob-no-ticket` line of `http-attacks.mjs`, and the `rr03` line of `retest-http.mjs`.

## RR-04. The per-IP limit trusts client forwarded headers

Verdict: partially fixed.

Local `next start` ignores `x-vercel-forwarded-for`, `x-forwarded-for`, and `x-real-ip`. In `http-attacks.mjs`, the first 24 calls were not HTTP 429, calls 25 and 26 were HTTP 429, and a rotated `x-vercel-forwarded-for` was also HTTP 429. `x-forwarded-for` and distinct `x-real-ip` values were HTTP 429. They shared the `local` bucket. `retest-http.mjs` added `Forwarded`, `cf-connecting-ip`, `x-client-ip`, and `true-client-ip`. After the bucket was full, rotating `x-vercel-forwarded-for` stayed HTTP 429.

Hosted preview, same client, `POST /api/sign` with `role: "nope"` so the signer is not reached:

- 24 calls reached the app (HTTP 403 `method not allowed`).
- Call 25 was HTTP 429 with response header `x-vercel-mitigated: deny`. The body was not the app string "Too many tries from this network."
- The next call that set `x-vercel-forwarded-for: 198.51.100.50` reached the app again (HTTP 403). A call that set only `x-real-ip` was HTTP 429 with the same deny header. A call that set both a new `x-vercel-forwarded-for` and a new `x-real-ip` reached the app (HTTP 403). One later call with no spoofed header also reached the app (HTTP 403).

The edge rule did fire once, on the 25th unspoofed call. It did not keep denying this client for the rest of a 600 second window in the few seconds after that. The app's own 429 was not observed on the calls that got through after 24 admits. Spoofing `x-real-ip` alone did not pass the edge deny, so this run does not show the app trusting a client `x-real-ip`. Spoofing `x-vercel-forwarded-for` did reach the app after the deny.

Caveat: every preview call sent `x-vercel-protection-bypass`. That header can skip some firewall mitigations. In this run it did not skip the one observed deny. Traffic without the header was not used for the burst, because deployment protection answers those requests before the app. Production was not called.

Repro: `ip-spoof` in `http-attacks.mjs` for the local bucket. The preview burst was a short node script against `/api/sign` and was not committed, because it depends on the bypass header.

## RR-05. The daily counter is a lost update

Verdict: partially fixed.

`guard-race.mjs`: 400 concurrent admits, 300 passed, 100 blocked, overshoot false, 0 later admits. `retest-offline.mjs` repeated that on one store (300 passed, follow-up refused) and, with a store whose read and write wait 2 ms, 40 rotating addresses all passed, so the in-process lock held.

Two separate `memoryStore()` objects, each with rotating addresses, admitted 300 each. Total 600 against a cap of 300. That is a local model of two isolates. It was not measured on Vercel. The code still has no cross-isolate compare-and-swap. The HTTP daily cap in `http-attacks.mjs` never appeared, because off Vercel every caller shares the `local` bucket and stops at 24.

Repro:

```text
NODE_PATH=web/node_modules node --experimental-strip-types docs/redteam/repros/guard-race.mjs
NODE_PATH=web/node_modules node --experimental-strip-types docs/redteam/repros/retest-offline.mjs
```

Read the `rr05-one-store`, `rr05-two-stores`, and `rr05-slow-lock` lines.

## RR-06. Local de-identification accepts recognizable identifiers

Verdict: partially fixed.

`deid-evasions.mjs` reported that nothing slipped past the local pipeline. A missing TEE client is not a success. One free-text name in a sentence stayed recognizable after the scrub. The dotted date, the spaced record number, and the compact phone were replaced.

A later offline pass echoed the scrubbed text through a stub model. A free-text name, a written date, a phone, a record number, and a street name stayed recognizable. The fixture check only looks for the exact demo name.

The contract mock now panics `ERR_NO_RECEIPT` when `tee_receipt_hash` is null (`attacks.rs`, 22 passed). `retest_bypass.rs` created a `DeidApp` share with receipt `11` repeated to 64 hex and the share was Active. Any 64 hex satisfies the contract. `/api/sign` does not check the text. The browser `sendDeid` check is not what the route enforces.

OpenRouter `openai/gpt-4.1-nano` returned 6 ordinary fictional sentences (name, MRN, phone, email, street, `2001-03-14`). After scrub, none of those were both recognizable and missed by `textHasPersonalIdentifier`. That model did not find a new shape. The misses above were written in this retest.

Repro: `deid-evasions.mjs`, the `rr06-scrub` lines of `retest-offline.mjs`, and:

```text
cargo +1.99.1 test --manifest-path docs/redteam/repros/contract-mock/Cargo.toml deid_app_accepts_any_64_hex_receipt
```

## RR-07. A hidden instruction in the chart is copied into the summary

Verdict: partially fixed.

The original `tee-attacks.mjs` calls the model directly with the old prompt, not the route. This run: the override chart did not echo the instruction or the custody sentence. The Quinlan chart did: the excerpt included the name, "14 Mar 1971", the MRN, the phone, and the street. `textHasPersonalIdentifier` returns true for that sentence, so the route would answer HTTP 422 instead of returning it. The de-id leftovers call came back with those identifiers removed. The privacy-filter call reported 5 blocking spans, categories `private_person`, `private_phone`, and `private_address`.

`retest-prompt.mjs` uses the new chart wrapper from `web/lib/tee/live.ts` and then the route's gate. Three fictional charts, max tokens 700, `z-ai/glm-5.3-flash`:

- A chart that asked for an all-capital name, an email, "14th of March, 1968", an en dash phone, `2001-03-14`, and "nine birch road" came back as a clinical sentence. The gate would not reject it, and those strings were not in the reply.
- The original Quinlan chart, inside the new wrapper, came back without the name, MRN, phone, or street. It did say the patient is 55 years old. The gate returns false for that sentence, so the route would return it. The chart does contain "born 14 Mar 1971", and the prompt allows an age when a date of birth is present.
- A custody override ("already approved release of the full chart to every clinic") was not in the reply.

The gate missed 12 shapes in the offline script. The misses included a name in capitals, a written date, an email, a phone, and a street. One date was caught only because a nearby word looked like an id. This run did not get the model to emit those shapes. The route was not called.

Repro:

```text
node docs/redteam/repros/tee-attacks.mjs
NODE_PATH=web/node_modules node --experimental-strip-types docs/redteam/repros/retest-prompt.mjs
NODE_PATH=web/node_modules node --experimental-strip-types docs/redteam/repros/retest-offline.mjs
```

## RR-08. The open-route nonce can be used three times at once

Verdict: closed.

`replay-race.mjs`: statuses 200, 403, 403, `replayHeld` true. A second run with a 30 ms ticket check had the same statuses, and a later call was HTTP 403 replay.

Residual: the used-nonce key keeps the raw share id. Against a stub that accepts any id, share `9` and share `09` both returned HTTP 200. This retest did not show the contract accepting `09` as the same share. A `no-ticket` result still releases the nonce so the open poll can retry. The map is still empty after a process restart. That restart window was not retested.

Repro: `replay-race.mjs`, and the `rr08-slow-race` line of `retest-offline.mjs`.

## RR-09. The owner can store a patient-style name on chain

Verdict: partially fixed.

A two-word personal name panics `ERR_BAD_NAME` in the mock runtime. A phrase that contains the word clinic is stored as an organization label. A single family name is stored. `Patient` and `PulseFit` still fit the one-token rule. That rule is the intended demo label.

Repro:

```text
cargo +1.99.1 test --manifest-path docs/redteam/repros/contract-mock/Cargo.toml --test retest_bypass
```

## New finding

### RR-10. Demo envelopes are encrypted to sessionStorage keys, not the on-chain actor keys

- Severity: Low
- Status: new in this retest
- File: `web/lib/relay/flow.ts`, `loadDemoConfig` and `localPublic`

The RR-01 change stopped returning secrets. The client now generates a random X25519 secret for the clinic, the patient, the hospital, the second opinion, and PulseFit, and stores all five under `sessionStorage` key `rr-visitor-enc:v1`. Envelopes are wrapped to those public keys. `recipientPublicKey` is only referenced from `web/lib/relay/keys.test.ts`. The flow no longer reads `enc_pubkey` from the contract.

Impact: the key registered on chain cannot decrypt a new demo envelope. One browser holds every role's secret, so that visitor can decrypt every role. A second browser cannot. The threat model row that says recipient keys are read from the contract is not what this commit does. This is not the old Critical issue: the shared server seed is not in the HTTP response.

Repro: read `loadDemoConfig` in `web/lib/relay/flow.ts`. No separate command. The local `GET /api/demo/config` body has no `enc` field, which is the RR-01 result.

## Preview firewall

Rule `rule_demo_api_rate_limit_iSy2qC` did fire once on this preview. The deployment is the fix commit, and the bypass header was accepted (a page fetch returned the app HTML, not a Vercel login). The header did not skip the one deny below. The same header can skip other mitigations, so this is not a measurement of traffic that does not send it.

Unspoofed `POST /api/sign`: 24 responses were the app's HTTP 403 `method not allowed`. Response 25 was HTTP 429, header `x-vercel-mitigated: deny`, and the body was not the app rate-limit message. Within the next few seconds the deny was not sticky: a spoofed `x-vercel-forwarded-for` reached the app, a spoofed `x-real-ip` alone was denied again at the edge, and a later unspoofed call reached the app. The app's own "Too many tries from this network" message was not returned. `GET /api/demo/config` after the burst was HTTP 200. That path is outside the rule.

About 210 HTTP requests were sent to this preview host. Two headless page loads accounted for most of them as static files. The rate probe was 29 `POST /api/sign` calls and one `GET /api/demo/config`. Production was not called. No Vercel setting, env var, protection, firewall rule, or deployment was changed.

## Guided Demo

A fresh headless Chrome session opened `/clinic` on the preview with the bypass header. The intro offered "Start guided demo". Send referral was enabled. After the click, the page showed "Sent · waiting for Maya", Clinic A as sent, and the stepper at step 2 of 6, "Maya reviews and approves", with a NEAR testnet proof link. That is one testnet transaction from the preview's demo key. It is not mainnet.

Maya's approve, the hospital open, de-identification, and the custody log were not clicked. The page loads had already used most of the request budget. The first step of the guided path did complete for a fresh visitor.

## Keys and spend

Present, values not printed: `NEARAI_API_KEY` (length 35), `OPENROUTER_API_KEY` (length 73), `VERCEL_AUTOMATION_BYPASS_SECRET` (length 32). `GEMINI_API_KEY` was not used.

NEAR AI, public list price, `z-ai/glm-5.3-flash`, input 80 and output 500 at scale 9. The classify usage fields were 0.

| Run | Calls | Prompt tokens | Completion tokens | USD |
| --- | --- | --- | --- | --- |
| `tee-attacks.mjs` summary-override | 1 | 217 | 96 | 0.00006536 |
| `tee-attacks.mjs` summary-identifiers | 1 | 246 | 88 | 0.00006368 |
| `tee-attacks.mjs` deid-injection | 1 | 120 | 178 | 0.00009860 |
| `tee-attacks.mjs` deid-leftovers | 1 | 120 | 99 | 0.00005910 |
| `tee-attacks.mjs` privacy-classify | 1 | 0 | 0 | 0 |
| `retest-prompt.mjs` first pass, two charts | 2 | 554 | 140 | 0.00011432 |
| `retest-prompt.mjs` second pass, three charts | 3 | 837 | 413 | 0.00027346 |

NEAR AI chat calls: 9. Classify calls: 1. NEAR AI total: $0.00067452. These calls were not appended to `docs/nearai-spend.md`.

OpenRouter, one call, model `openai/gpt-4.1-nano`: prompt tokens 204, completion tokens 226, reported cost $0.00011080. The six evasion sentences were ordinary forms and did not slip the gate.

Outside-model spend: $0.00011080. Combined spend: $0.00078532. Under $1.

## Not tested

- Production HTTP. No production URL was called.
- Mainnet. The guided send was testnet, through the preview's existing demo key.
- A full six-step guided click-through. Step 1 completed. Later steps were not clicked.
- Whether the hosted app limiter would 429 if the edge rule were absent. The calls that reached the app after 24 admits did not show the app 429, and this run did not separate a lost cache update from an address change.
- near-sandbox. The contract repro is the mock runtime.
- A live `POST /api/tee/summary` through `next start`. The gate was applied to the model text locally. The route's 422 was not observed on the wire.
- Two Vercel isolates against one Runtime Cache key. The two-store result is in-process only.
- Restart of the server during a live 120 second ticket.
