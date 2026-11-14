use near_sdk::json_types::U64;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{AccountId, near};

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ActorRegisteredData {
    pub account_id: AccountId,
    pub role: String,
    #[serde(default)]
    pub self_registered: bool,
}

/// Self-only key rotation. `key_version` is the version after the change.
#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ActorUpdatedData {
    pub account: AccountId,
    pub old_key_hash: String,
    pub new_key_hash: String,
    pub key_version: U64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct OwnerProposedData {
    pub old_owner: AccountId,
    pub new_owner: AccountId,
    pub proposal_nonce: U64,
    pub expires_at_ns: U64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct OwnerChangedData {
    pub old_owner: AccountId,
    pub new_owner: AccountId,
    pub proposal_nonce: U64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct OwnerProposalCancelledData {
    pub new_owner: AccountId,
    pub proposal_nonce: U64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct RecordCreatedData {
    pub record_id: U64,
    pub patient: AccountId,
    pub created_by: AccountId,
    pub request_id: String,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ReferralRequestedData {
    pub share_id: U64,
    pub record_id: U64,
    pub to: AccountId,
    pub purpose_hash: String,
    pub request_id: String,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ShareConsentedData {
    pub share_id: U64,
    pub record_id: U64,
    pub granted_sections: Vec<String>,
    pub expires_at_ns: U64,
    pub read_only: bool,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ShareTransformedData {
    pub share_id: U64,
    pub record_id: U64,
    pub artifact_hash: String,
    pub tee_receipt_hash: String,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ShareDeclinedData {
    pub share_id: U64,
    pub record_id: U64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ShareCreatedData {
    pub share_id: U64,
    pub record_id: U64,
    pub kind: String,
    pub to: AccountId,
    pub parent: Option<U64>,
    pub request_id: String,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ShareOpenedData {
    pub share_id: U64,
    pub record_id: U64,
    pub nonce_hash: String,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct RecordOpenedData {
    pub record_id: U64,
    pub nonce_hash: String,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ReplySubmittedData {
    pub share_id: U64,
    pub reply_share_id: U64,
    pub record_id: U64,
    pub reply_hash: String,
    pub request_id: String,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ShareRevokedData {
    pub share_id: U64,
    pub record_id: U64,
}

/// One object. Record-wide revoke does not list share ids.
#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct RecordGrantsRevokedData {
    pub record_id: U64,
    pub old_epoch: U64,
    pub new_epoch: U64,
}

/// NEP-297 events. `standard` stays `referral_relay`. Payload version is `2.0.0`.
#[near(event_json(standard = "referral_relay"))]
pub enum RelayEvent {
    #[event_version("2.0.0")]
    ActorRegistered(Vec<ActorRegisteredData>),
    #[event_version("2.0.0")]
    ActorUpdated(Vec<ActorUpdatedData>),
    #[event_version("2.0.0")]
    OwnerProposed(Vec<OwnerProposedData>),
    #[event_version("2.0.0")]
    OwnerChanged(Vec<OwnerChangedData>),
    #[event_version("2.0.0")]
    OwnerProposalCancelled(Vec<OwnerProposalCancelledData>),
    #[event_version("2.0.0")]
    RecordCreated(Vec<RecordCreatedData>),
    #[event_version("2.0.0")]
    ReferralRequested(Vec<ReferralRequestedData>),
    #[event_version("2.0.0")]
    ShareConsented(Vec<ShareConsentedData>),
    #[event_version("2.0.0")]
    ShareTransformed(Vec<ShareTransformedData>),
    #[event_version("2.0.0")]
    ShareDeclined(Vec<ShareDeclinedData>),
    #[event_version("2.0.0")]
    ShareCreated(Vec<ShareCreatedData>),
    #[event_version("2.0.0")]
    ShareOpened(Vec<ShareOpenedData>),
    #[event_version("2.0.0")]
    RecordOpened(Vec<RecordOpenedData>),
    #[event_version("2.0.0")]
    ReplySubmitted(Vec<ReplySubmittedData>),
    #[event_version("2.0.0")]
    ShareRevoked(Vec<ShareRevokedData>),
    #[event_version("2.0.0")]
    RecordGrantsRevoked(Vec<RecordGrantsRevokedData>),
}
