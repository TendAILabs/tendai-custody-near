# Environment variables

Names only. Do not put values in git, logs, or this file.

## Hosted Vercel app

| Name | Where it is used |
| --- | --- |
| `NEARAI_API_KEY` | Server only. The TEE routes call NEAR AI Cloud with it. `web/lib/http/nearai-proxy.ts` returns 404 and does not forward a caller body. The browser must not see the key. |
| `DEMO_SESSION_SECRET` | Signs the demo session cookie. It is not the NEAR AI key. |
| `RELAY_CONTRACT_ID` | Testnet contract account the open route views. |
| `SUPPORT_ADMIN_ACCOUNT_ID` | Public testnet account allowed to open `/admin/support`. This is not the contract account. If the name is empty, every sign-in is refused. |
| `KV_REST_API_URL` | Upstash Redis REST URL for support tickets and the support rate limit. If this or the token is empty outside local development, support returns 503. |
| `KV_REST_API_TOKEN` | Upstash Redis token for support writes. Server only. |
| `KV_REST_API_READ_ONLY_TOKEN` | Upstash Redis read-only token from the Marketplace install. The support route does not use it. |
| `KV_URL` | Upstash Redis URL from the Marketplace install. The support route uses the REST URL and token. |
| `REDIS_URL` | Upstash Redis URL from the Marketplace install. The support route uses the REST URL and token. |
| `NEAR_RPC_URL` | JSON-RPC URL for view calls. Default in code is `https://test.rpc.fastnear.com`. |
| `NEAR_NETWORK` | `testnet`. |
| `BLOB_READ_WRITE_TOKEN` | Not set on this Vercel project. The app does not read it. A private Blob store would set this name. None was created for the copy fix. |
| `BLOB_DIR` | Optional local ciphertext directory for dev and tests. On Vercel it is `/tmp` inside one function. The de-id route does not share that directory with `/api/open`. |
| `DEMO_ENC_SEED` | Demo X25519 keys are derived from this seed. Needed if the hosted demo reproduces those keys. |

## Keys the hosted app reads

`web/lib/near/sign-handler.ts` chooses the signer from the role:

| Role | Account env | Secret env |
| --- | --- | --- |
| clinic | `CLINIC_A_ACCOUNT_ID` | `CLINIC_A_FC_PRIVATE_KEY` |
| hospital | `HOSPITAL_B_ACCOUNT_ID` | `HOSPITAL_B_FC_PRIVATE_KEY` |
| second | `SECOND_OPINION_ACCOUNT_ID` | `SECOND_OPINION_FC_PRIVATE_KEY` |
| app (PulseFit) | `PULSEFIT_ACCOUNT_ID` | `PULSEFIT_FC_PRIVATE_KEY` |
| patient | `DEMO_PATIENT_ACCOUNT_ID` | `DEMO_PATIENT_PRIVATE_KEY` |

`DEMO_PATIENT_PRIVATE_KEY` is a full-access key. Consent methods attach 1 yoctoNEAR. The hosted app reads that name.

`DEMO_ENC_SEED` derives the demo encryption keys. `DEMO_SESSION_SECRET` is the browser session token. It is not the NEAR AI key.

## Full-access names for local tooling

These names are for local tooling (`scripts/setup-testnet.ts`, `scripts/pulsefit-fc-key.ts`, `deploy-kit/provision.sh`). Production and Preview code does not read them. As of 2026-11-14 they are off Production and Preview. They remain for local tooling and Development only.

- `RELAY_OWNER_PRIVATE_KEY`
- `CLINIC_A_FULL_PRIVATE_KEY`
- `HOSPITAL_B_FULL_PRIVATE_KEY`
- `SECOND_OPINION_FULL_PRIVATE_KEY`
- `LAKESIDE_FULL_PRIVATE_KEY`
- `PULSEFIT_FULL_PRIVATE_KEY`

`LAKESIDE_ACCOUNT_ID` and `LAKESIDE_FC_PRIVATE_KEY` exist for the Lakeside actor. The web signer has no Lakeside role.

`RELAY_FAUCET_ACCOUNT_ID` and `RELAY_FAUCET_PRIVATE_KEY` fund a per-visitor implicit account with 0.03 testnet NEAR (`FAUCET_TRANSFER_YOCTO` in `web/lib/visitor/limits.ts`). TendAI Labs creates that account and puts the names on Vercel. If either name is missing, `POST /api/visitor/start` returns 503 `faucet not configured` and the app keeps the shared demo patient key, labeled as held by the demo server. Do not put the key value in git.

The live contract is `rr191f8afd-contract.testnet`. PulseFit's hosted signer is `PULSEFIT_FC_PRIVATE_KEY` on `rr191f8afd-pulsefit.testnet`, limited to `request_open`. The older notes in `docs/runbooks/pulsefit-fc-key.md` describe the previous contract `rr6c9910d7.testnet`.

## Preview selftest

| Name | Where it is used |
| --- | --- |
| `RR_SELFTEST_TOKEN` | Preview only. `POST /api/dev/selftest` compares the `x-rr-selftest` header to this value with a constant-time compare. The route returns 404 unless `VERCEL_ENV` is `preview`. Add this name on Vercel for Preview, and for Cloud Agents. Do not set it for Production. |

`VERCEL_AUTOMATION_BYPASS_SECRET` is a Vercel system variable at build and runtime. Clients send it as `x-vercel-protection-bypass` to skip Deployment Protection. Vercel does not list that header among the request headers a function can read, so the selftest route does not use it as its own secret.
