# TendAI Custody contract

Rust custody contract for TendAI Custody, schema 2. The Cargo crate name stays `referral-relay`. Consent, scope, expiry, revocation, and open tickets live here. Record plaintext does not. This build is for a fresh account. It does not migrate schema 1 state.

Build and test from this directory:

```bash
cargo test --lib
cargo test --test sandbox
```

`cargo near build` produces the wasm. This repository does not deploy. The `cargo near new` template's deploy workflows were removed so a pull request cannot publish the contract. `scripts/deploy-v2.sh` is a manual testnet script and is not run by CI.

`DESIGN-V2.md` is the storage rule, the grant epoch, the request id, the owner transfer, and the upgrade policy. Public methods use `#[deny_unknown_arguments]` from near-sdk 5.30.1, so a JSON object with an unknown field fails to deserialize.

`register_actor` is owner-only and insert-only. A duplicate account returns `ERR_ALREADY_REGISTERED`. Roles do not change afterward. `rotate_enc_key` is self-only and emits `actor_updated`. `self_register_patient` lets the predecessor register itself as Patient and pay for that actor row.

Clinic function-call keys may call only `staff_method_names`. `approve_share`, `decline_share`, `create_share`, `revoke_share`, and `revoke_all_for_record` require exactly 1 yoctoNEAR. There is no contract method that upgrades the code.
