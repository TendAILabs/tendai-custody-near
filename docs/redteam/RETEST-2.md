# TendAI Custody retest 2

Independent retest of draft PR #21. The reviewer did not write the fixes. The product is designed around HIPAA principles. De-identification here is best effort. This report does not claim the demo has no remaining weaknesses.

The live UI and the README use one compliance phrase. The product is designed around HIPAA principles.

| Item | Value |
| --- | --- |
| Repo | Development repo of this project |
| Head | `603efa7b` (`603efa7b214d66d7b80fc7693f0a4d545d10ce74`), branch `cursor/rename-and-partials-3f0c` |
| When | 2026-11-11, UTC |
| Preview | https://tendaicustody.app (public origin). The temporary preview host used on 2026-11-11 is omitted. Commit `603efa7b`. |
| Contract | `rr6c9910d7.testnet`, code hash `CTD2VwCeoo4XMKA1YriJJuzKuDhAWLbmDVNZS56Dbw6W`, wasm 240511 bytes |
| Contract runtime for name cases | near-sdk mock runtime inside `cargo +1.99.1 test --lib`. rustc 1.99.1. Not near-sandbox |
| Node | v22.23.4 |
| Data | fictional only. No mainnet call. Production was not called |

The preview calls sent `x-vercel-protection-bypass`. That header can skip some firewall mitigations. In this run the edge deny still fired. The secret value is not recorded here. No Vercel setting, env var, protection, firewall rule, or deployment was changed. The repo was not made public.

## Verdicts

| ID | Severity | Retest verdict |
| --- | --- | --- |
| RR-04 | Medium | partly fixed |
| RR-05 | Medium | partly fixed |
| RR-06 | Medium | partly fixed |
| RR-07 | Medium | partly fixed |
| RR-09 | Info | partly fixed |
| RR-10 | Low | closed |

## RR-04. Per-IP limit on the hosted preview

Verdict: partly fixed.

The active firewall rule is still `rule_demo_api_rate_limit_iSy2qC` ("Demo API rate limit"). It is active, fixed window, 24 requests per 600 seconds, key `ip`, paths `/api/sign`, `/api/tee/`, and `/api/nearai`. `updatedAt` is 2026-11-10. This retest did not edit it.

`clientIp` in `web/lib/guard/visitor.ts` ignores `x-forwarded-for`, `x-real-ip`, and `forwarded`. Off Vercel every caller is `local`. On Vercel the bucket is the rightmost hop of `x-vercel-forwarded-for`. A single client-supplied value is that whole key. A bad rightmost hop becomes `unknown`.

Hosted `POST /api/sign` with `role: "nope"`, so the signer is not reached:

- Eight earlier firewall-path calls (two summaries, anonymous sign, create record, four receipt attempts) plus `plain-0` through `plain-16` all reached the app. That is 25 app responses. `plain-17` was the first HTTP 429. Header `x-vercel-mitigated: deny`. The body was `{"error":{"code":"429","message":"Too Many Requests",...}}`, not "Too many tries from this network."
- The deny did not persist. From `plain-17` through the spoof calls, deny and app 403 alternated one for one. A left-only `x-vercel-forwarded-for`, a two-hop value, `x-forwarded-for`, `x-real-ip`, `forwarded`, and a later unspoofed call all followed that alternation. This run does not show those headers choosing a different edge key.
- After a 20 second pause, three calls (unspoofed, left hop, `x-real-ip`) all reached the app.
- A second burst then admitted 20 unspoofed calls in a row, all HTTP 403 `method not allowed`. Later series of left hop, right hop, `x-forwarded-for`, `x-real-ip`, and `forwarded` each received a mix of edge 429 and app 403. None of the spoofed headers opened a lane that avoided the edge deny.
- Across both bursts the app's own 429 was not returned. The second burst alone put 48 requests through to `method not allowed`. That is past 24, and the message "Too many tries from this network" did not appear.

The edge rule still fires. It does not hold this client for the rest of a 600 second window. Spoofed forwarding headers were not required to get past it. The hosted app limiter did not take over once the edge let a call through. This run cannot see the rightmost hop the app stored, so it does not separate a lost Runtime Cache update from a hop that changes per request.

Repro: `POST /api/sign` with `{"role":"nope","method":"nope","args":{}}` and the bypass header. The first burst is the `plain-*` and spoof labels from the uncommitted probe. The second burst was 20 unspoofed calls, then 12 with `x-vercel-forwarded-for: 198.51.100.50`, 12 with `x-vercel-forwarded-for: 203.0.113.7, 198.51.100.77`, then 8 each of `x-forwarded-for`, `x-real-ip`, and `forwarded`.

## RR-05. One shared budget

Verdict: partly fixed.

One process, two `memoryStore()` objects, cap 300: the first store admitted 300 and the second store admitted 0. Two `memoryStore({ isolated: true })` objects admitted 300 each. Two OS processes, each with its own `memoryStore()`, admitted 300 each. The in-process budget is shared. A second process is not.

On the preview, sign and summary calls share the edge rule's path group: both counted toward the same deny. They did not share an observable app-level 300 cap. Dozens of admitted sign calls stayed HTTP 403 `method not allowed`. The daily message "This demo has used its NEAR AI calls for today" was not returned. This run stopped well below 301 on purpose. It does not show two Vercel isolates racing one Runtime Cache key, and the code still has no cross-isolate compare-and-swap.

Repro, from a shell with `web/node_modules` installed:

```text
node --experimental-strip-types /tmp/retest-offline.mjs
```

Read `budget` and `twoProcesses`. The hosted half is the same `/api/sign` burst as RR-04, plus the two `/api/tee/summary` calls below.

## RR-06. Free-text names, dash variants, and forged receipts

Verdict: partly fixed.

What an attacker can do with a forged receipt:

- No session cookie, `POST /api/sign` `create_share` kind `DeidApp` with 64 hex: HTTP 401 `sign in required`. No transaction.
- After `GET /api/demo/config` and a real `create_record`, the same method with receipt `ab` repeated to 64 hex, with `null`, with `abcd`, and with a 64-character value that ends in an en dash: HTTP 403 `receipt was not issued`. No share transaction.
- The check is the cookie's `issued` list (`authorizeStoryMethod` in `web/lib/session/visitor.ts`). The list is filled by `/api/tee/deid` with `sha256` of the de-identified text. It is not a check that a TEE signed that artifact. A cookie that already lists a hash is allowed to send that hash with any `artifact_hash`. This run did not complete that success path, because it would have broadcast a share.
- The contract still does not keep an issued set. `create_share` for `DeidApp` requires the field to be present and 64 hex (`ERR_NO_RECEIPT` when it is missing, `clean_hash` otherwise) and then stores it. The deployed wasm contains the bytes `ERR_NO_RECEIPT`. A direct signed `create_share` was not sent: the patient key is not in this environment, and `pnpm attack-demo` exited before a transaction because `.env` is absent. An attacker who can sign as the patient, outside `/api/sign`, can still store any 64 hex receipt and get an Active share.

Free text and dashes, `textHasPersonalIdentifier` and `scrubText`, anchor `2026-10-14`:

The gate caught capital and lowercase copies of the extra fictional name. It also caught a title-case placeholder name, a written date, an email, several phone shapes, a record number, and a street written in words.

Still recognizable after scrub, and the gate is false:

- `QuinlanVoss` and `QUINLANVOSS`
- `jane doe`
- `Jane Dоe` with a Cyrillic `о`
- `qvoss(at)example.com`
- bare `14.03.1968` and bare `14-03-1968`
- `555` + soft hyphen + `0142`, and `555` + U+2015 + `0142`
- `55-year-old` and `aged 55`

`Born 14.03.1968` is removed by the id regex, which treats a short word plus dotted groups as an id, not by the date rule. The bare date is untouched. A missing TEE client is still `ok: false` at stage `tee`.

The preview created record `48` on `rr6c9910d7.testnet` (`7HPQpzf9MvJqEnt1MzwJ28qFtSV7vmRCo5t1XaL9yH8F`, patient `rr-patient-6c9910d7.testnet`, section `history`). A view of that record confirms it. It has no forged share.

## RR-07. Summary gate, and whether the UI says so

Verdict: partly fixed.

The route `POST /api/tee/summary` uses `textHasPersonalIdentifier` on the model text and returns 422 instead of the text when the gate matches.

Hosted, fictional charts, deployment `dpl_DJkkhov4eM95NAzSm5n9Az6o1vV5`:

- A chart that asked for lowercase `jane doe`, `14.03.1968`, a soft-hyphen phone, `55-year-old`, and `ada.lovelace@example.com` returned HTTP 200. The sentence was "Referral to cardiology is for a retest. No examination findings or medication entries appear elsewhere in the record beyond that reason." None of those strings were in it. The local gate is false for that sentence. The model did not emit the shapes the gate misses.
- A fictional chart that still held a name, a date, an email, a phone, and a street returned HTTP 422. The identifier text was not in the response.

The UI does say the de-identification limit. Live `/`, `/help`, `/terms`, and `/privacy` include "De-identification is best effort, with a preview." `/privacy` also says a stripped copy "may miss something" and is not a promise against re-identification. The help pages say the product is designed around HIPAA principles. The summary card in `web/components/wireframe/consent-screen.tsx` is labeled "TEE verified" and does not itself say the identifier gate is best effort. The shell footer on those pages does.

The gate misses listed under RR-06 are still misses. A summary that consisted only of `jane doe` or bare `14.03.1968` would be returned. This run did not get the model to do that.

## RR-09. Names in a facility string and in a free field

Verdict: partly fixed.

The web app has no field that calls `register_actor`. `POST /api/sign` has no `register_actor` method, so a facility name cannot be written through the preview. The purpose box is free text. `sendClinicReferral` encrypts that text to the patient `enc_pubkey` and sends the cipher hash. The support form keeps the name in the browser and does not post it. This run did not submit a purpose or a support note.

Direct view calls on `rr6c9910d7.testnet`:

| Account | display_name |
| --- | --- |
| `rr-clinic-a-6c9910d7.testnet` | Riverbend Family Clinic |
| `rr-hospital-b-6c9910d7.testnet` | St. Aster General |
| `rr-second-6c9910d7.testnet` | Northgate Heart Institute |
| `rr-lakeside-6c9910d7.testnet` | Lakeside Family Medicine |
| `rr-pulsefit-6c9910d7.testnet` | PulseFit |
| `rr-patient-6c9910d7.testnet` | Patient |

Owner is `rr6c9910d7.testnet`. The wasm contains `ERR_BAD_NAME`, `maya`, `okafor`, `quinlan`, `voss`, `clinic`, `hospital`, and `pulsefit`. It does not contain `Jane`.

The same source, mock runtime, `cargo +1.99.1 test --lib` (the five name tests were added for this run and then removed, so they are not in the tree):

- Stored: `North Clinic Jane Doe`, `Clinic, Jane Doe`, `App Jane Doe`, `Clinic Oka` plus U+200B plus `for`, and `Clinic M` plus Cyrillic `а` plus `ya`.
- `ERR_BAD_NAME`: free field `Jane Doe`, bare `Okafor`, and `North Clinic Maya Okafor`.
- A clinic predecessor calling `register_actor` gets `ERR_NOT_OWNER` before the name is stored.

A signed owner call was not broadcast. The owner key is not in this environment. The live directory was not changed. The listed-name bypass from the previous retest is rejected by this source, and those names are in the deployed wasm. Any other personal name next to `clinic`, `hospital`, `app`, or the other org tokens is still stored. A free two-word name with no org token is rejected.

## RR-10. Envelopes wrap to the on-chain key

Verdict: closed.

`loadDemoConfig` keeps `contractId` and `accounts` only. `chainPublic` reads `get_actor.enc_pubkey` and passes `serverHex: null` to `recipientPublicKey`, which returns the chain hex. Hosted `GET /api/demo/config` was HTTP 200 with keys `contractId` and `accounts` only. `hex64` was false. There was no `enc` field.

The clinic HTML and the ten script files on that page (698001 bytes): 0 `ed25519:` values, 0 hits for `DEMO_ENC_SEED`, `DEMO_PATIENT_PRIVATE_KEY`, `NEARAI_API_KEY`, or `CLINIC_A_FC_PRIVATE_KEY`, 0 hits for `rr-visitor-enc`. One file contains `get_actor`, `enc_pubkey`, and the error `on-chain encryption key missing`, then `serverHex: null`. The `secretKey` hits are the X25519 library's ephemeral `keygen`, which an envelope wrap needs. They are not an actor secret.

`GET /api/status` and the summary and sign bodies checked here did not contain an `ed25519:` secret or those env names. `/api/open` can still decrypt with the server seed after a ticket. That seed was not in a response this run.

## Rename

User-facing UI, both READMEs, and the Next.js metadata title are TendAI Custody. Live `/`, `/help`, `/terms`, and `/privacy` contain `TendAI Custody` and do not contain the previous product name.

Allowed leftovers that are still present: crate name `referral-relay`, event standard `referral_relay`, and account `rr6c9910d7.testnet`. Design HTML titles and the red-team report titles now say TendAI Custody. The public site is https://tendaicustody.app.

Not shown in the UI. Renaming the HKDF info strings changes ciphertext, so they stay:

- HKDF info strings `referral-relay/v1/actor` and `referral-relay/v1/wrap`.

The Cargo description and the crate doc now say TendAI Custody. The wireframe storage key named in the earlier note is not in `web/lib/story.ts`. The HKDF strings are not a product-name claim.

## New finding

### RR-11. The privacy strip says the private key stays on the device

- Severity: Low
- Status: new in this retest
- File: `web/components/wireframe/privacy-strip.tsx`

The strip's first step says "Plaintext and the private key stay here." The hosted bundle does not keep an actor secret. It wraps to `enc_pubkey`. The actor secret that matches that public key is derived from `DEMO_ENC_SEED` on the server, and `/api/open` decrypts with it after the ticket check. The README already says demo encryption keys are seeded. The strip does not. This is not RR-01: the seed was not in the HTTP bodies checked above.

## attack-demo

`pnpm attack-demo` from the repo root exited 1 before any testnet call:

```text
ENOENT: no such file or directory, open '.env'
```

The testnet private keys are not in this environment. The Vercel env API listed the key names and returned empty secret values. No unsigned substitute was treated as a pass. The earlier gate log's six passes are the author's run, not this one.

What this retest did sign, through the preview's own demo key: one `create_record`, transaction `7HPQpzf9MvJqEnt1MzwJ28qFtSV7vmRCo5t1XaL9yH8F`, record 48. The forged-receipt attempts did not sign.

## Keys and spend

Present in the environment, values not printed: `NEARAI_API_KEY`, `OPENROUTER_API_KEY`, `VERCEL_AUTOMATION_BYPASS_SECRET`. The bypass secret was used only as the preview header.

NEAR AI: two hosted `POST /api/tee/summary` calls, on the preview's key. The route does not return token counts. Exact USD was not computed and was not added to `docs/nearai-spend.md`. OpenRouter calls: 0. Local NEAR AI calls: 0. OpenRouter spend: $0.

## Not tested

- Production HTTP.
- Mainnet.
- A signed owner `register_actor` on the live contract.
- A signed patient `create_share` that bypasses `/api/sign`.
- `pnpm attack-demo` past the missing `.env`.
- Two warm Vercel isolates racing one Runtime Cache key up to 301.
- A summary completion that actually emits `jane doe` or a bare dotted date. The gate would allow that text. The model did not produce it.
