# Custody contract V2

Schema 2 is a fresh contract. It does not read schema 1 state and it has no migrate method. Deploy it to a new testnet account. The NEP-297 standard name stays `referral_relay`. Event payloads are version `2.0.0`.

## Storage rule

Methods that add an actor row (`register_actor`, `self_register_patient`) measure storage after the collections flush. The attached deposit must cover that cost. The contract refunds the excess to the caller.

`create_record`, `request_referral`, and `submit_reply` add one bounded row plus index entries. Clinic function-call keys cannot attach a deposit, so those rows are paid from the contract account balance. Each row is fixed-width aside from the account ids and display name chosen at creation: at most five section hashes, one operation record, and one share or record index entry. A patient can have at most 1024 records that ever held a pending share (`FENWICK_MAX`).

`create_share` attaches exactly 1 yoctoNEAR. That is the consent signal, not a storage payment. It adds one bounded share row, paid by the contract account.

`approve_share`, `decline_share`, `revoke_share`, `revoke_all_for_record`, `request_open`, `request_owner_open`, and `rotate_enc_key` do not allocate storage. Opens replace a ticket slot that was allocated with the row and update `open_count` and `last_opened_ns`. Record-wide revoke increments `grant_epoch` and adjusts a fixed-width pending counter. Single-share revoke writes that share in place.

There is no storage-credit balance and no withdrawal method. That system is a design boundary, not part of this contract.

## Grant epoch

Each record starts at grant epoch 1. A share, including a child and a Reply, stores the epoch it was created under. `revoke_all_for_record(record_id, expected_epoch)` requires the current epoch. It increments the epoch and emits one `record_grants_revoked` event. Shares from an older epoch are effectively revoked. The call does not walk them. Passing the previous epoch on a retry returns the current epoch and emits nothing. Epoch 0 is rejected.

`revoke_share` still changes only that share. It does not revoke children.

## Pages

`list_shares_for_record`, `list_shares_for_recipient`, `list_actors`, and `list_pending_for_patient` read the requested index range from maps. The limit is capped at 50. A view does not scan every record in the contract. Pending shares are indexed per patient. A record revoke drops that record's pending count in the patient's index without reading the shares.

## Request id and encryption context

`create_record`, `request_referral`, `create_share`, and `submit_reply` take a 32-byte `request_id` (64 hex characters). The same caller, method, and request id with the same arguments returns the original id and does not emit another event. Different arguments return `ERR_REQUEST_ID_CONFLICT`. A replay does not resurrect a revoked share.

The encryption context is:

```text
SHA-256(
  ASCII("referral_relay/v2/context\0near:testnet\0")
  || Borsh(contract_id)
  || Borsh(caller)
  || method_tag
  || request_id
)
```

Account ids are Borsh strings (little-endian u32 length, then UTF-8). Method tags are CreateRecord 0, RequestReferral 1, CreateShare 2, SubmitReply 3. The numeric id is not an input. The contract returns that id from the call. Rust and TypeScript vectors live in `contract/src/unit_tests.rs` and `web/lib/near/context.test.ts`.

## Consent and owner

Patient approvals, decline, create_share, revoke_share, and revoke_all_for_record require exactly 1 yoctoNEAR. A function-call key cannot attach that deposit. The clinic that created a record can still call `request_owner_open`.

Roles do not change after registration. `register_actor` rejects a duplicate account. `rotate_enc_key` changes only the caller's key and emits `actor_updated` with `account`, `old_key_hash`, `new_key_hash`, and `key_version`. The owner has no method that writes a patient's key or role.

Owner transfer is `propose_owner` then `accept_owner`. The proposal expires in at most seven days, and acceptance must be strictly before that time. Cancel is `cancel_owner`. Each of those calls requires 1 yoctoNEAR.

## Upgrade policy

This contract has no method that replaces its code and no unauthenticated upgrade path. On NEAR, a full-access key on the contract account can still deploy new code. That key is outside the owner methods. For an immutable deployment, initialize in the same transaction as the deploy, then delete every full-access key on the contract account and keep owner actions on the separate owner account. Deleting those keys is irreversible. This repository does not do that deletion. If a full-access key is kept, that key is the upgrade authority and it is not limited by `propose_owner`.

## Receipt hashes

`tee_receipt_hash` is a 32-byte value the patient authorizes. The contract checks the length and the hex shape. It does not verify an issuer certificate or a TEE attestation. On-chain issuer verification is a design boundary and is not implemented.

## History

The contract does not store a per-open vector. Custody history for a record is the NEP-297 receipt log plus the fixed counters on the record and the share (`open_count`, `last_opened_ns`). A view that only reads contract state cannot reconstruct every open.

## Allocator

`wee_alloc` is the only default feature of near-sdk 5.30.1. This crate sets `default-features = false`. The wasm32 target uses its own allocator. The unmaintained `wee_alloc` crate is not a dependency of the contract build.
