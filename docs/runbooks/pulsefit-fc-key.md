# PulseFit function-call key

The function-call key swap is done. This is testnet only. The account is `rr-pulsefit-6c9910d7.testnet`. The contract is `rr6c9910d7.testnet`. The server signs `request_open` with `PULSEFIT_FC_PRIVATE_KEY`. The app does not read `PULSEFIT_FULL_PRIVATE_KEY`.

Do not add another key. Do not delete the old full-access key. It stays on the account, and `PULSEFIT_FULL_PRIVATE_KEY` can stay in Vercel.

| Public key | Permission | Transaction |
| --- | --- | --- |
| `ed25519:2yT9WZx1SoidBMSzZCtiFLece6pjtye8zdQxexWGxw1E` | FullAccess | `FwkKt6SPg7jKypM1FAHhRmhy31omnHiS9G4eV18dvzbL` |
| `ed25519:8AwfGjNwQ8zKXuUQtEYJy76bnBGCbJqGMWyYdDms4wRo` | FunctionCall, receiver `rr6c9910d7.testnet`, method `request_open`, allowance 1 NEAR | `Cpd3TGmqp4aXpwYqXGRpE4HHcJEJvvsApsaHbDHgULEt` |

Do not paste a private key, a seed phrase, or a Vercel bypass link into chat, git, or a log. The steps below are the record of how the function-call key was added. They are finished. Do not point them at mainnet.

## What the key is allowed to do

The server signs one contract method for PulseFit. That method is `request_open`. The call attaches no deposit. It does not add a key, delete a key, transfer NEAR, or create an account. A function-call key cannot attach a deposit, and this call does not need one.

The allowance is `1 NEAR`. That matches the other function-call keys in this demo. The allowance pays gas only. `request_open` is signed with 100 Tgas, which is about 0.01 NEAR at the usual price. The allowance is charged at the buy price and credited back when the gas refund arrives, so the key needs headroom above the final fee. One NEAR covers many sequential opens. The allowance on an existing key cannot be raised. If it runs out, add a new function-call key.

## CLI version

These commands were read from `near-cli-rs` 0.31.1 on 2026-11-13, and from [the access key page](https://docs.near.org/protocol/accounts-contracts/access-keys) and [the view access key RPC](https://docs.near.org/api/rpc/contracts) linked from [docs.near.org/llms.txt](https://docs.near.org/llms.txt).

[The NEAR CLI page](https://docs.near.org/tools/cli) also lists `near generate-keypair save-to-file`. That command is not in the 0.31.1 binary. `near generate-keypair --help` answers that the command does not exist. This runbook generates the key with the local script below, which writes the JSON shape `sign-with-access-key-file` reads and prints only the public key.

Check the binary before you continue:

```bash
near --version
near account add-key --help
```

You want `near-cli-rs 0.31.1`, and the help should list `grant-function-call-access`. The official installer for that release is:

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/download/v0.31.1/near-cli-rs-installer.sh | sh
```

## 1. Generate the new key

From the repo root:

```bash
pnpm pulsefit:fc-key
```

That runs `node --experimental-strip-types scripts/pulsefit-fc-key.ts`. It writes `.data/keys/pulsefit-fc.json` with mode `0600`. The first printed line is the public key. The second line is `wrote .data/keys/pulsefit-fc.json`. The private key stays in the file. `.data/` is gitignored. If the file already exists, the script stops. Move the old file aside yourself before you generate another key.

Copy the public key into your shell. A public key is safe to keep in the terminal.

```bash
export ACCOUNT_ID=rr-pulsefit-6c9910d7.testnet
export CONTRACT_ID=rr6c9910d7.testnet
export PUBLIC_KEY='paste the public key here'
```

## 2. Write the existing full-access key to a local file

Adding a key has to be signed by a full-access key. Use the secret you already stored when the PulseFit account was created. `vercel env pull` does not return Production or Preview Secret values, so it cannot recover this one.

Load your local env without printing it, then write the signer file:

```bash
set -a
. ./.env
set +a
pnpm pulsefit:fc-key -- --write-signer
unset PULSEFIT_FULL_PRIVATE_KEY
```

The script reads `PULSEFIT_FULL_PRIVATE_KEY` from the environment. It does not take the secret as an argument. The first printed line is the public key of the full-access key that signed the add. That key stays on the account.

```bash
export FULL_PUBLIC_KEY='paste that public key here'
```

The script writes `.data/keys/pulsefit-full.json`. That file has `public_key` and `private_key`, which is the shape `sign-with-access-key-file` accepts. If `PULSEFIT_FULL_PRIVATE_KEY` is missing, the script exits and does not create the file. Stop there if you do not already have the secret.

## 3. Add the function-call key on testnet

```bash
near account add-key "$ACCOUNT_ID" \
  grant-function-call-access \
  --allowance '1 NEAR' \
  --contract-account-id "$CONTRACT_ID" \
  --function-names request_open \
  use-manually-provided-public-key "$PUBLIC_KEY" \
  network-config testnet \
  sign-with-access-key-file .data/keys/pulsefit-full.json \
  send
```

`--function-names` is a comma-separated list. PulseFit has one method, `request_open`. `--allowance '1 NEAR'` is the gas budget. `network-config testnet` selects testnet. `sign-with-access-key-file` reads the local JSON file, so the full-access secret is not a command argument. `send` submits the transaction.

## 4. Verify with view_access_key

List every key on the account:

```bash
near account list-keys "$ACCOUNT_ID" network-config testnet now
```

Then read the new key by itself. This is the `view_access_key` query from the RPC docs:

```bash
curl -sS https://rpc.testnet.near.org \
  -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":\"dontcare\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key\",\"finality\":\"final\",\"account_id\":\"${ACCOUNT_ID}\",\"public_key\":\"${PUBLIC_KEY}\"}}"
```

The same body works against `https://test.rpc.fastnear.com`, which is the RPC this repo uses for views.

You want `permission.FunctionCall.receiver_id` equal to `rr6c9910d7.testnet`. You want `method_names` to contain only `request_open`. You want `allowance` equal to `1000000000000000000000000`, which is 1 NEAR. `permission` should be an object. A string value of `FullAccess` on this public key means the wrong key type was added. Stop and do not put that secret in Vercel.

## 5. Set the secret in Vercel

The app reads the private key string, the same text as the `private_key` field. It does not read the JSON file. Write that one line to a mode `0600` file without showing it:

```bash
jq -r .private_key .data/keys/pulsefit-fc.json > .data/keys/pulsefit-fc.secret
chmod 600 .data/keys/pulsefit-fc.secret
```

From `web/`, confirm the linked project before you write anything:

```bash
cd web
vercel project inspect
```

The project is `referral-relay`. Confirm the linked team with `vercel project inspect` before you add a secret. Then add the name to Production and Preview as a Secret. The value is read from the file, so it is not a shell argument. Vercel CLI 59.6 or later accepts `--type secret`. A non-interactive add to Production or Preview is stored as a Secret when the type flag is omitted.

```bash
vercel env add PULSEFIT_FC_PRIVATE_KEY production,preview --type secret < ../.data/keys/pulsefit-fc.secret
```

If the team policy Separate Production Secret Values rejects one shared value, add the two targets separately. The testnet key is still the same secret.

```bash
vercel env add PULSEFIT_FC_PRIVATE_KEY production --type secret < ../.data/keys/pulsefit-fc.secret
vercel env add PULSEFIT_FC_PRIVATE_KEY preview --type secret < ../.data/keys/pulsefit-fc.secret
```

A deployment that was built before this add does not see the new name. Set the name before you deploy the commit that reads it. After the add succeeds, remove the local copies:

```bash
shred -u ../.data/keys/pulsefit-fc.secret ../.data/keys/pulsefit-fc.json || rm -f ../.data/keys/pulsefit-fc.secret ../.data/keys/pulsefit-fc.json
```

The local signer file is not needed for the app. The old full-access key stays on the account. Do not delete it.

## 6. The old full-access key stays

The old full-access key was not deleted. Leave it on `rr-pulsefit-6c9910d7.testnet`. Leave `PULSEFIT_FULL_PRIVATE_KEY` in Vercel. The new full-access key from the table above also stays. The app does not sign with either one.
