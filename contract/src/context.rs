//! Encryption context for V2 creations.
//!
//! SHA-256 over a fixed domain and the Borsh bytes of
//! (contract id, caller, method tag, request id). The numeric record or share
//! id is not an input. Method tags are CreateRecord 0, RequestReferral 1,
//! CreateShare 2, SubmitReply 3. Account ids are Borsh strings: a little-endian
//! u32 length followed by the raw UTF-8 bytes.

use near_sdk::{AccountId, env};

pub const CONTEXT_DOMAIN: &[u8] = b"referral_relay/v2/context\0near:testnet\0";

pub fn derive_context(
    contract_id: &AccountId,
    caller: &AccountId,
    method: u8,
    request_id: &[u8; 32],
) -> [u8; 32] {
    let mut preimage = Vec::with_capacity(64 + contract_id.len() + caller.len());
    preimage.extend_from_slice(CONTEXT_DOMAIN);
    push_borsh_str(&mut preimage, contract_id.as_str());
    push_borsh_str(&mut preimage, caller.as_str());
    preimage.push(method);
    preimage.extend_from_slice(request_id);
    let digest = env::sha256(&preimage);
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    out
}

pub fn push_borsh_str(out: &mut Vec<u8>, value: &str) {
    let bytes = value.as_bytes();
    out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(bytes);
}
