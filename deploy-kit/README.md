# Schema 2 deploy kit

Copy this folder to a Mac. Do not clone the repository. Do not install Rust or pnpm.

The wasm in this folder is the reproducible schema 2 build.

- File: `referral_relay.wasm`
- Bytes: 278564
- SHA-256: `67b2ec90989a2f6b6afbebb1b77061b479c65f787943f82ac0cd61ab478e5d3b`

`deploy.sh` checks that hash before it talks to the network. It does not compile anything.

## What you need

- `near-cli-rs` 0.31.1 (`npm install -g near-cli-rs@latest`). That release has no `generate-keypair` command. `provision.sh` makes a key with `near account create-account fund-later use-auto-generation save-to-folder`, then keeps only `public_key` and `private_key`.
- `node`
- `jq`
- `openssl`
- `vercel` CLI, already logged in (`vercel login`)

Leave the network on testnet. Every script here refuses mainnet.

## What you run

1. `./provision.sh`
2. `SECRETS_DIR=<the printed directory> ./deploy.sh`
3. `SECRETS_DIR=<the printed directory> ./vercel-env.sh`

Private keys are written only under `$HOME/.tendai-v2/<prefix>/`, mode 600. The terminal prints account ids and public keys. If the faucet rate-limits a request, the script pauses 20 seconds, says so, and retries. Run `./provision.sh` again with the same `SECRETS_DIR` if it stops. It skips accounts and function-call keys that are already in place.

`DEMO_PATIENT_PRIVATE_KEY` is a full-access key. Patient consent methods attach 1 yoctoNEAR, and a function-call key cannot attach NEAR.

Encryption public keys are derived in `enc-public.mjs` with `node:crypto`. The seed is `DEMO_ENC_SEED`. The salt is the account id. The info string is `referral-relay/v1/actor`. That matches the app.

The steps that matter on the Mac are the three commands above.

## Files

- `provision.sh` creates the accounts and keys
- `deploy.sh` checks the wasm hash, deploys, and registers
- `vercel-env.sh` adds each name from `vercel.env` to production, preview, and development
- `enc-public.mjs` derives an encryption public key
- `near-view.mjs` reads accounts and keys. It does not sign
- `referral_relay.wasm` is the contract
- `README.md` is this file
