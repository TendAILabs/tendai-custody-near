# TendAI Custody red team

Independent review. The reviewer did not write the application. Findings only. No application code was changed.

The product is designed around HIPAA principles. That means patient authorization, a minimum necessary share, and an access log. De-identification here is best effort. This report does not claim the demo has no remaining weaknesses.

| Item | Value |
| --- | --- |
| Repo | TendAILabs/TendAI-NEAR, private |
| Starting commit | `060ea5d7` (`060ea5d73f05a27954f0a95dc0d89de582ac61f1`), branch `main` |
| When | 2026-11-11, about 09:40 to 09:55 Bangkok (UTC+7) |
| Contract under test | source at that commit, plus read-only views of `rr6c9910d7.testnet` |
| App under test | local `next start` of a production build of `web/` at that commit |
| Contract runtime | near-sdk 5.30.1 mock runtime (`testing_env`), rustc 1.99.1. Not near-sandbox |
| Node | v22.23.4. Next.js 16.4.5. The build used the repo's pnpm 10.15.0 |
| Data | fictional only. A synthetic encryption seed was used for the local server. No demo private key and no mainnet key was used |

## Counts

| Severity | Count |
| --- | --- |
| Critical | 1 |
| High | 1 |
| Medium | 5 |
| Low | 1 |
| Info | 1 |

## RR-01. Demo config returns every actor encryption secret

- Severity: Critical
- Status: confirmed
- File: `web/app/api/demo/config/route.ts` lines 16 to 33

The route reads `DEMO_ENC_SEED`, derives an X25519 secret for the clinic, the patient, the hospital, the second-opinion clinic, and PulseFit, and returns those secrets as JSON. There is no session check. The only limiter is an in-process counter of 60 requests a minute for everyone (`web/lib/open/limit.ts`). The Vercel firewall rule does not match `/api/demo/config`.

Expected: encryption secrets stay on the device that owns them. A network caller does not receive a key that decrypts another actor's envelopes.

Observed: on local `next start`, `GET /api/demo/config` returned HTTP 200. The body held five distinct 64-hex secrets. The patient secret matched HKDF from the synthetic seed. An envelope encrypted to that public key decrypted with the returned secret. The plaintext was a short fictional sentence. The seed string itself was not in the body.

Repro:

1. From `web/`, build with `pnpm build`.
2. Start `next start` with a synthetic `DEMO_ENC_SEED` (64 hex chars), `RELAY_CONTRACT_ID`, and the five account id env names set. Do not point this at a real seed. The command in `docs/redteam/repros/http-attacks.mjs` expects the seed `0123456789abcdef` repeated to 64 hex chars.
3. `NODE_PATH=web/node_modules node --experimental-strip-types docs/redteam/repros/http-attacks.mjs http://127.0.0.1:3210`
4. Read the `demo-config` line. `returnedSecretMatchesSeed` and `decryptRoundtrip` are true.

Suggested fix: stop returning secret keys from this route. The browser that generates a key can keep the secret. If the demo must reconstruct a key, do it inside a process the anonymous caller cannot query.

## RR-02. `/api/sign` signs as the patient with no caller check

- Severity: High
- Status: confirmed
- File: `web/app/api/sign/route.ts` lines 43 to 77

Any caller who can reach the route chooses a role and a method. The patient role uses `DEMO_PATIENT_PRIVATE_KEY` and attaches 1 yoctoNEAR for `approve_share`, `decline_share`, `create_share`, `revoke_share`, and `revoke_all_for_record`. The contract then sees the demo patient as `predecessor_account_id`. Arguments are the caller's JSON. `register_actor` is rejected. Consent and revoke are not.

Expected: only the patient can approve or revoke, and a function-call key cannot attach the 1 yocto deposit.

Observed: the contract tests below do reject a clinic, a stranger, and a forged signer. The HTTP route does not. An unauthenticated `POST /api/sign` with `role: "patient"`, `method: "revoke_share"`, and a fictional share id returned HTTP 400 `{"error":"sign failed"}`. That is the signer failing locally on an invalid canary key, before any transaction. It was not HTTP 401 or 403. The same call after the daily AI cap was already full still returned `sign failed`, so signing is outside the 300-call cap. `register_actor` returned HTTP 403 `method not allowed`. The canary string was not in either body.

Repro: the `sign-patient-revoke` and `sign-method-allowlist` lines from the same `http-attacks.mjs` run. Use an invalid key so the process cannot broadcast. Do not substitute a live demo key.

Suggested fix: require a caller credential that is not the signing key, and do not accept anonymous consent or revoke. Keep the contract checks. They are not enough while the server holds the patient key and signs whatever the request asks.

## RR-03. Blob download skips the ticket gate

- Severity: Medium
- Status: confirmed
- File: `web/app/api/blob/route.ts` lines 18 to 35

`GET /api/blob?hash=` returns the stored bytes when the hash matches `sha256` hex. It does not call `check_ticket`. Section hashes and artifact hashes are public on the contract.

Expected: ciphertext is released only after a live ticket, which is what `/api/open` does.

Observed: `PUT` of the fictional bytes `fictional-ciphertext-envelope-v1` returned HTTP 201. `GET` of that hash returned HTTP 200 and the same bytes. `GET` with `hash=../.env` returned HTTP 400. A body of 1,000,001 bytes returned HTTP 400. No ticket was sent.

Repro: the `blob-no-ticket` line from `http-attacks.mjs`.

Suggested fix: require the same ticket check as `/api/open` before `GET`. Keep the size cap.

## RR-04. The per-IP limit trusts client forwarded headers

- Severity: Medium
- Status: confirmed
- File: `web/lib/guard/visitor.ts` lines 74 to 78

`clientIp` uses `x-vercel-forwarded-for`, then `x-forwarded-for`. It does not read `x-real-ip`. On `next start` the client sets both forwarded headers.

Expected: one client stays inside 24 calls per 10 minutes, and a spoofed forwarding header does not mint a new bucket.

Observed on local `next start`, against `/api/sign` so the daily AI counter was not involved:

- 24 calls with `x-vercel-forwarded-for: 198.51.100.10` were not HTTP 429. Calls 25 and 26 were HTTP 429.
- The next call with `x-vercel-forwarded-for: 198.51.100.11` was HTTP 403 (method not allowed), not 429.
- A call with only `x-forwarded-for: 203.0.113.21` was HTTP 400, not 429. That header selected its own bucket.
- `x-real-ip` is ignored. Twenty-six calls that sent only `x-real-ip: 192.0.2.10` were rejected with HTTP 429 starting at call 25. The next calls, each with a different `x-real-ip`, were still HTTP 429. They shared the `unknown` bucket.

Hosted Vercel may overwrite `x-vercel-forwarded-for`. That was not tested. See the preview note below.

Repro: `ip-spoof` in `http-attacks.mjs`, then a fresh server for the `x-real-ip` pair if the unknown bucket is already full.

Suggested fix: rate limit on the connection address the platform sets, and ignore client-supplied forwarding headers unless the proxy strips them first.

## RR-05. The daily counter is a lost update

- Severity: Medium
- Status: confirmed
- File: `web/lib/guard/visitor.ts` lines 107 to 131

`admit` reads a list of timestamps, appends one, and writes the list back. Two overlapping calls can both read the same list. The second write drops the first call's timestamp.

Expected: the 301st AI call in a UTC day is refused, including when many calls are in flight together.

Observed:

- In one process, 400 concurrent `admit({ kind: "ai" })` calls on `memoryStore` all returned ok. The limit is 300. Twenty later calls, one after another, also returned ok. Command: `NODE_PATH=web/node_modules node --experimental-strip-types docs/redteam/repros/guard-race.mjs`
- On local `next start`, a fresh process, 400 parallel `POST /api/tee/summary` calls with distinct `x-vercel-forwarded-for` values did stop at 300. 300 responses were HTTP 503 (admitted, then refused because `NEARAI_API_KEY` was unset). 100 were HTTP 429 with "This demo has used its NEAR AI calls for today." A follow-up call was HTTP 429 with the same message. This scheduler did not lose updates. The in-process result shows the counter can lose them.

The `$4` ledger in `web/lib/tee/spend.ts` reads `docs/nearai-spend.md` and ignores a failed write. A host that cannot read that file starts from an empty ledger. That backup was not the thing under test here. The 300-call cap is the one the routes call.

Suggested fix: store an integer and increment it in one atomic operation. Refuse the call when the increment would pass 300.

## RR-06. Local de-identification accepts recognizable identifiers

- Severity: Medium
- Status: confirmed
- Files: `web/lib/deid/scrub.ts` lines 64 to 97, `web/lib/deid/pipeline.ts` lines 63 to 64, `web/lib/relay/flow.ts` lines 320 to 322, `web/lib/tee/live.ts` lines 144 to 151

`scrubText` removes exact identifier strings, case-sensitive name parts, and a few regular expressions. `runDeidPipeline` with `client: null` returns ok when those exact strings are gone. `sendDeid` blocks the exact name "Maya Okafor" and a preview of a fixed chart. It sends the `after` string it was given. `POST /api/tee/deid` ignores the request body and always scans the Maya fixture, so this route is not an injection point.

Expected: a copy that still shows a name, a date of birth, an MRN, a phone number, or a street is not treated as cleared.

The offline scrub left 15 of 18 fictional strings recognizable. The local pipeline returned ok. Exact copies of the demo name were replaced. Dotted dates, spaced record numbers, and compacted phones were not.

A live de-identification pass on a fictional note replaced the name, the record number, the phone, and the street. A date remained in the returned text. A later privacy-filter call marked a person, a phone, and a street. It did not mark the date. The contract still accepts a de-identified share with an empty receipt hash.

Repro: `docs/redteam/repros/deid-evasions.mjs` and the `deid-leftovers` call in `docs/redteam/repros/tee-attacks.mjs`. The contract case is `cargo +1.99.1 test --manifest-path docs/redteam/repros/contract-mock/Cargo.toml deid_share`.

Suggested fix: do not return ok when the TEE client is missing. Bind the bytes that are shared to the bytes that were scanned. Reject a `DeidApp` share with no receipt if a receipt is part of the claim. Treat dates, lowercase ids, and compacted phones as identifiers even when they are not the exact fixture string.

## RR-07. A hidden instruction in the chart is copied into the summary

- Severity: Medium
- Status: confirmed
- Files: `web/lib/tee/live.ts` lines 91 to 103, `web/app/api/tee/summary/route.ts` lines 34 to 41

The summary prompt is one user message. The chart is concatenated after the line "Chart:". The route returns the model text. It does not scrub it.

Expected: instructions inside the chart do not override the summary rules, and the reply does not invent an age or repeat a full identifier set just because the chart says to.

Observed, live `z-ai/glm-5.3-flash`, same prompt text as `teeSummary`, `max_tokens` 700, `reasoning_effort` low:

- One fictional chart asked the model to print its instructions. The reply did not include those instructions.
- Another fictional chart asked the model to repeat a name, a date, a record number, a phone, and a street. The reply repeated them. The route would have returned that text.

A de-id prompt that said to ignore the JSON shape and to emit the same identifiers started with a JSON object that did not contain them, then spent the rest of the 700 token cap on reasoning about the conflict. That reply was cut off. It is not proof the model always refuses.

Repro: `node docs/redteam/repros/tee-attacks.mjs` with `NEARAI_API_KEY` in the environment. The script prints token counts and short excerpts. It does not print the key.

Suggested fix: put the chart in a delimited data block, tell the model not to follow instructions inside it, and run the summary through the same identifier check as de-identification before returning it.

## RR-08. The open-route nonce can be used three times at once

- Severity: Low
- Status: confirmed
- File: `web/lib/open/handle.ts` lines 59 to 73

The handler checks a process-local map, awaits the ticket view, then records the nonce. Overlapping calls can all pass the check.

Expected: a second use of the same nonce is HTTP 403 `replay`, including when the calls are in flight together. The single-threaded test in `web/lib/open/handle.test.ts` does get 403 on a later call.

Observed: three concurrent `handleOpen` calls with the same fictional nonce, the same share id, and a stub that says the ticket is valid all returned HTTP 200. Command: `NODE_PATH=web/node_modules node --experimental-strip-types docs/redteam/repros/replay-race.mjs`. The result line is `{"statuses":[200,200,200],"concurrentOpens":3,"replayHeld":false}`.

This releases the same envelope more than once. It does not authorize a different account. The map is also empty after a process restart. That restart window was already documented and was not re-tested here.

Suggested fix: record the nonce before the first await, and ignore a duplicate that arrives while the first call is still running.

## RR-09. The owner can store a patient-style name on chain

- Severity: Info
- Status: confirmed
- File: `contract/src/lib.rs` lines 1163 to 1168, and `register_actor` at lines 295 to 318

`clean_name` allows any non-control string up to 64 characters. The threat model says actor names on chain are org-level.

Expected: a patient name is rejected, or the field is limited to the org label the directory is supposed to hold.

In the mock runtime the owner stored a two-word personal name as a display name. `get_actor` returned that string. The test is `owner_can_store_a_patient_style_display_name`.

The live directory read on 2026-11-11 did not contain that name. The patient actor's display name on `rr6c9910d7.testnet` was "Patient". This finding is about what the current source accepts, not about a name already stored.

Suggested fix: if org-only names are a requirement, check the shape in `register_actor` and keep personal names out of the actor record.

## What held

Contract, mock runtime, 22 tests, `cargo +1.99.1 test --manifest-path docs/redteam/repros/contract-mock/Cargo.toml`. All passed.

- An unregistered account cannot `create_record` (`ERR_NOT_REGISTERED`). The patient cannot (`ERR_BAD_ROLE`). A stranger cannot `register_actor` (`ERR_NOT_OWNER`).
- A second clinic cannot `request_referral` on a record it did not create (`ERR_UNAUTHORIZED`).
- A purpose string that is not 64 hex characters is rejected (`ERR_BAD_HASH`). The fictional label "Fictional patient name" does not land in `purpose_hash`.
- The hospital cannot `request_open` while the share is still `Requested` (`ERR_BAD_STATUS`).
- A stranger cannot `request_open` an Active share (`ERR_UNAUTHORIZED`).
- The clinic cannot `approve_share` even with 1 yoctoNEAR (`ERR_UNAUTHORIZED`).
- A call whose signer is the patient and whose predecessor is the hospital cannot approve (`ERR_UNAUTHORIZED`). The contract uses the predecessor.
- `approve_share` with 0 deposit panics with the one-yocto message.
- After `revoke_share`, `request_open` panics `ERR_REVOKED`, and `check_ticket` is false inside the 120 second window. A second `check_ticket` before revoke is still true. The contract does not consume the nonce. The server is supposed to. See RR-08 for the server race.
- The ticket is valid at 120 seconds and false 1 nanosecond later.
- A ticket opened by the hospital does not satisfy `check_ticket` for the clinic.
- The hospital cannot `request_owner_open` a record it did not create. The creating clinic can. That matches the contract method checks. It is not a hospital consent bypass.
- A section key with a zero-width character is rejected.
- A registered clinic can create many records. There is no per-clinic cap. Unregistered writes still fail. That is the stated storage rule, with the honest limit that a curated clinic key can grow state until the contract account runs out of balance.
- `read_only: true` does not block `submit_reply`. The reply share is addressed to the patient. The plan says a read-only second opinion can still reply to the patient, so this was not scored as a break.
- An empty `granted_sections` list still activates the share, and `request_open` then succeeds. The subset rule allows an empty subset. The bytes that move are the artifact hash the approver submits. Noted, not scored as its own finding.

Local server and client build:

- `POST /api/open` for live share id 1 on `rr6c9910d7.testnet` returned HTTP 403 `{"error":"revoked"}`. That was a read of chain status. No transaction was sent.
- The NEAR AI proxy did not connect to a local listener on 127.0.0.1. `GET /api/nearai/v1/attestation/report` returned HTTP 200 without the demo session, which matches the documented unauthenticated gateway report. `POST /api/nearai/v1/chat/completions` with the demo session and no upstream key returned HTTP 500 `missing upstream key`. Paths outside the allowlist, without the session, returned HTTP 401. A follow-up with the session was not useful on that process because the daily cap was already full and the route returned HTTP 429 first.
- Blob path traversal and the 1,000,001 byte upload were rejected.
- `web/.next/static`, 66 files: no match for `NEARAI_API_KEY`, `DEMO_PATIENT_PRIVATE_KEY`, `DEMO_ENC_SEED`, `CLINIC_A_FC_PRIVATE_KEY`, `RELAY_OWNER_PRIVATE_KEY`, `BLOB_READ_WRITE_TOKEN`, `DEMO_SESSION_SECRET`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, the build canary `redteam-canary-7f3a9c2e1b`, the `NEARAI_API_KEY` value, or `ed25519:`. The fictional demo name is present because the screens render that chart. It is not a server-only secret. Dates, record numbers, phones, and streets from the old chart text are not listed here.
- Missing `NEARAI_API_KEY` on `/api/tee/summary` returned HTTP 503 `{"error":"Error"}`. The canary was not in the body.
- Read-only views of `rr6c9910d7.testnet` at finality `final`: owner is the contract account, six actors, display names are org names plus "Patient". Records 1 through 7 and their shares and timelines did not contain the fictional demo name or a street, a phone, or a record number from the chart. Section hashes were 64 hex characters. No state was written.

## Daily cap

On one local `next start` process, the 300 AI calls per UTC day cap held. A 400-wide parallel burst was split 300 admitted and 100 refused with the daily message. An earlier run that mixed a few probes, an 80-wide burst, and a sequential follow-up also stopped at 300.

The same cap does not hold for every schedule of `admit`. The in-process race in RR-05 admitted 420 calls against the limit of 300. Signing does not increment the daily counter. Spoofing `x-vercel-forwarded-for` does not reset that counter. It does reset the per-IP counter (RR-04).

The cap across separate Vercel instances was not tested.

## Preview firewall

Not tested.

`rule_demo_api_rate_limit_iSy2qC` was read from the active project firewall config. It is active. The action is `rate_limit`, fixed window, 24 requests per 600 seconds, key `ip`. The conditions are path prefixes `/api/sign`, `/api/tee/`, and `/api/nearai`, combined as alternatives. There is no environment field on the rule. The paths do not include `/api/demo/config`, `/api/blob`, or `/api/open`. The custom-rule docs describe publish as applying to the production deployment. This review did not send traffic to a preview host.

No existing preview protection bypass was available. Reaching a preview would need an existing Vercel deployment-protection bypass, or an authenticated session, for a preview URL. This review did not change firewall rules, env vars, or deployment protection, and it did not call production.

## Keys and spend

`NEARAI_API_KEY` was present in the environment (length 35). It was used only by `docs/redteam/repros/tee-attacks.mjs`. It was not printed and it is not in this report. `OPENROUTER_API_KEY` and `GEMINI_API_KEY` were absent, so the attack strings were written in this review. No outside model was called. Outside-model spend: $0.

NEAR AI, public list price, `z-ai/glm-5.3-flash` input 80 and output 500 at scale 9:

| Call | Prompt tokens | Completion tokens | Est. USD |
| --- | --- | --- | --- |
| summary-override | 217 | 45 | 0.00003986 |
| summary-identifiers | 246 | 125 | 0.00008218 |
| deid-injection | 120 | 700 | 0.00035960 |
| deid-leftovers | 120 | 113 | 0.00006610 |
| privacy-classify | reported 0 | reported 0 | 0 |

Chat calls: 4. Classify calls: 1. The classify response's usage fields were 0, so that row is $0 as reported and may be slightly low. NEAR AI total from the priced fields: $0.00054774.

These calls were not appended to `docs/nearai-spend.md`. This change set is only `docs/redteam/`.

## Not tested

- Preview and production HTTP. No preview bypass was available. Production was out of scope.
- Mainnet. No mainnet transaction.
- Mutating testnet calls. This environment did not have the demo account keys. The sign repro used an invalid canary so the key parser threw before a broadcast.
- near-sandbox and near-workspaces. The contract repro is the near-sdk mock runtime, the same `testing_env` path as `contract/src/unit_tests.rs`. It is not a sandbox node.
- A full de-id completion at the app's 4096 token cap. The injection call stopped at 700 tokens.
- Whether the hosted edge overwrites `x-vercel-forwarded-for`, and whether the daily counter is shared across Vercel instances.
- Restart of the server during a live 120 second ticket. The in-memory nonce reset is the known gap. It was not re-run.
