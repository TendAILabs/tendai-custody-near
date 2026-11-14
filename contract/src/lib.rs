//! TendAI Custody contract, schema 2.
//!
//! Fresh accounts only. There is no migration from schema 1 and no contract
//! method that replaces code. Consent is still a full-access key: patient
//! approvals attach exactly 1 yoctoNEAR, which a function-call key cannot do.
//! The clinic that created a record keeps owner-open. Record plaintext is not
//! stored. Receipt hashes stay patient-authorized opaque bytes.
//!
//! Storage rule: see `contract/DESIGN-V2.md`. Opens and revokes update
//! fixed-size fields only. Registrations that add an actor row charge the
//! attached deposit and refund the excess.

mod context;
mod events;

use context::{derive_context, push_borsh_str};
use events::*;
use near_sdk::json_types::U64;
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, NearToken, PanicOnDefault, Promise, assert_one_yocto, env, near, require,
};

const MAX_NAME_CHARS: usize = 64;
const HASH_LEN: usize = 64;
const PAGE_MAX: u32 = 50;
const MAX_EXPIRY_NS: u64 = 365 * 24 * 60 * 60 * 1_000_000_000;
const TICKET_TTL_NS: u64 = 120 * 1_000_000_000;
const OWNER_PROPOSAL_MAX_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;
const SCHEMA_VERSION: u32 = 2;
/// Power of two. One patient can have this many records that ever held a pending share.
const FENWICK_MAX: u64 = 1024;
const SECTION_KEYS: [&str; 5] = ["history", "meds", "labs", "imaging", "notes"];
const STAFF_METHODS: [&str; 5] = [
    "create_record",
    "request_referral",
    "request_open",
    "request_owner_open",
    "submit_reply",
];
const M_RECORD: u8 = 0;
const M_REFERRAL: u8 = 1;
const M_SHARE: u8 = 2;
const M_REPLY: u8 = 3;

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Role {
    Clinic,
    Patient,
    App,
}

impl Role {
    fn as_str(self) -> &'static str {
        match self {
            Self::Clinic => "Clinic",
            Self::Patient => "Patient",
            Self::App => "App",
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum ShareKind {
    Referral,
    SecondOpinion,
    Transfer,
    DeidApp,
    Reply,
}

impl ShareKind {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Referral => "Referral",
            Self::SecondOpinion => "SecondOpinion",
            Self::Transfer => "Transfer",
            Self::DeidApp => "DeidApp",
            Self::Reply => "Reply",
        }
    }

    fn tag(&self) -> u8 {
        match self {
            Self::Referral => 0,
            Self::SecondOpinion => 1,
            Self::Transfer => 2,
            Self::DeidApp => 3,
            Self::Reply => 4,
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ShareStatus {
    Requested,
    Active,
    Declined,
    Revoked,
}

#[near(serializers = [json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EffectiveStatus {
    Requested,
    Active,
    Declined,
    Revoked,
    Expired,
}

#[near(serializers = [json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CreateMethod {
    CreateRecord,
    RequestReferral,
    CreateShare,
    SubmitReply,
}

impl CreateMethod {
    fn tag(self) -> u8 {
        match self {
            Self::CreateRecord => M_RECORD,
            Self::RequestReferral => M_REFERRAL,
            Self::CreateShare => M_SHARE,
            Self::SubmitReply => M_REPLY,
        }
    }
}

/// Fixed 64-byte account slot so owner changes do not resize the root state.
#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
struct AccountSlot {
    len: u8,
    bytes: [u8; 64],
}

impl AccountSlot {
    fn from_account(id: &AccountId) -> Self {
        let raw = id.as_bytes();
        require!(raw.len() <= 64 && !raw.is_empty(), "ERR_BAD_ACCOUNT");
        let mut bytes = [0u8; 64];
        bytes[..raw.len()].copy_from_slice(raw);
        Self {
            len: raw.len() as u8,
            bytes,
        }
    }

    fn to_account(&self) -> AccountId {
        let len = self.len as usize;
        require!(len > 0 && len <= 64, "ERR_BAD_ACCOUNT");
        let text = std::str::from_utf8(&self.bytes[..len])
            .unwrap_or_else(|_| env::panic_str("ERR_BAD_ACCOUNT"));
        text.parse()
            .unwrap_or_else(|_| env::panic_str("ERR_BAD_ACCOUNT"))
    }
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
struct TicketSlot {
    present: bool,
    nonce: [u8; 32],
    at_ns: u64,
}

impl TicketSlot {
    fn empty() -> Self {
        Self {
            present: false,
            nonce: [0u8; 32],
            at_ns: 0,
        }
    }
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
struct Actor {
    role: Role,
    display_name: String,
    enc_pubkey: [u8; 32],
    active: bool,
    key_version: u64,
    received_count: u64,
    pending_slots: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ActorView {
    pub account_id: AccountId,
    pub role: Role,
    pub display_name: String,
    pub enc_pubkey: String,
    pub active: bool,
    pub key_version: U64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct SectionMeta {
    pub key: String,
    pub cipher_hash: String,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
struct Record {
    id: u64,
    patient: AccountId,
    created_by: AccountId,
    section_present: [bool; 5],
    section_hash: [[u8; 32]; 5],
    created_at_ns: u64,
    /// Current grant generation. Shares store the value they were created under.
    grant_epoch: u64,
    epoch_changed_at_ns: u64,
    share_count: u64,
    pending_count: u64,
    /// 0 means this record has never had a pending share. Slots are not reused.
    pending_slot: u64,
    open_count: u32,
    last_opened_ns: u64,
    patient_ticket: TicketSlot,
    clinic_ticket: TicketSlot,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct RecordView {
    pub id: U64,
    pub patient: AccountId,
    pub created_by: AccountId,
    pub sections: Vec<SectionMeta>,
    pub created_at_ns: U64,
    pub grant_epoch: U64,
    pub share_count: U64,
    pub open_count: u32,
    pub last_opened_ns: Option<U64>,
    pub epoch_changed_at_ns: Option<U64>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
struct Share {
    id: u64,
    record_id: u64,
    parent: u64,
    kind: ShareKind,
    initiator: AccountId,
    to: AccountId,
    requested_mask: u8,
    granted_mask: u8,
    purpose_hash: [u8; 32],
    artifact_present: bool,
    artifact_hash: [u8; 32],
    tee_present: bool,
    tee_receipt_hash: [u8; 32],
    read_only: bool,
    expires_at_ns: u64,
    status: ShareStatus,
    created_at_ns: u64,
    consented_at_ns: u64,
    revoked_at_ns: u64,
    grant_epoch: u64,
    open_count: u32,
    last_opened_ns: u64,
    recipient_ticket: TicketSlot,
    patient_ticket: TicketSlot,
    in_pending: bool,
    pending_index: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct ShareView {
    pub id: U64,
    pub record_id: U64,
    pub parent: Option<U64>,
    pub kind: ShareKind,
    pub initiator: AccountId,
    pub to: AccountId,
    pub requested_sections: Vec<String>,
    pub granted_sections: Vec<String>,
    pub purpose_hash: String,
    pub artifact_hash: Option<String>,
    pub tee_receipt_hash: Option<String>,
    pub read_only: bool,
    pub expires_at_ns: Option<U64>,
    pub status: ShareStatus,
    pub effective_status: EffectiveStatus,
    pub created_at_ns: U64,
    pub consented_at_ns: Option<U64>,
    pub revoked_at_ns: Option<U64>,
    pub open_count: u32,
    pub last_opened_ns: Option<U64>,
    pub grant_epoch: U64,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
struct Operation {
    args_hash: [u8; 32],
    result_id: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct OperationView {
    pub account_id: AccountId,
    pub method: CreateMethod,
    pub request_id: String,
    pub result_id: U64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct OwnerProposalView {
    pub proposed: AccountId,
    pub nonce: U64,
    pub expires_at_ns: U64,
}

#[near(
    contract_state,
    contract_metadata(standard(standard = "referral_relay", version = "2.0.0"),)
)]
#[derive(PanicOnDefault)]
pub struct Contract {
    schema_version: u32,
    owner: AccountSlot,
    proposal_present: bool,
    proposed_owner: AccountSlot,
    proposal_expiry_ns: u64,
    proposal_nonce: u64,
    actors: LookupMap<AccountId, Actor>,
    actor_at: LookupMap<u64, AccountId>,
    actor_count: u64,
    records: LookupMap<u64, Record>,
    shares: LookupMap<u64, Share>,
    /// (record id, index) -> share id. Pages read this range only.
    record_share_at: LookupMap<(u64, u64), u64>,
    /// (recipient, index) -> share id.
    recipient_share_at: LookupMap<(AccountId, u64), u64>,
    /// (record id, grant epoch, local index) -> share id. Old epochs are abandoned.
    pending_at: LookupMap<(u64, u64, u64), u64>,
    /// (patient, fenwick slot) -> record id.
    pending_slot_record: LookupMap<(AccountId, u64), u64>,
    /// Patient pending counts. Index 0 is unused. Values stay fixed-width u64.
    fenwick: LookupMap<(AccountId, u64), u64>,
    /// (caller, method tag, request id) -> first result.
    operations: LookupMap<(AccountId, u8, [u8; 32]), Operation>,
    next_record_id: u64,
    next_share_id: u64,
}

#[near]
impl Contract {
    /// Deploy and initialize in one transaction, signed by this contract account.
    /// `owner` is a different account. There is no upgrade or migrate method.
    #[init]
    #[deny_unknown_arguments]
    pub fn new(owner: AccountId) -> Self {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "ERR_INIT"
        );
        require!(owner != env::current_account_id(), "ERR_INIT");
        let empty = AccountSlot::from_account(&owner);
        Self {
            schema_version: SCHEMA_VERSION,
            owner: AccountSlot::from_account(&owner),
            proposal_present: false,
            proposed_owner: empty,
            proposal_expiry_ns: 0,
            proposal_nonce: 0,
            actors: LookupMap::new(1u8),
            actor_at: LookupMap::new(2u8),
            actor_count: 0,
            records: LookupMap::new(3u8),
            shares: LookupMap::new(4u8),
            record_share_at: LookupMap::new(5u8),
            recipient_share_at: LookupMap::new(6u8),
            pending_at: LookupMap::new(7u8),
            pending_slot_record: LookupMap::new(8u8),
            fenwick: LookupMap::new(9u8),
            operations: LookupMap::new(10u8),
            next_record_id: 1,
            next_share_id: 1,
        }
    }

    #[deny_unknown_arguments]
    pub fn staff_method_names(&self) -> Vec<String> {
        STAFF_METHODS.iter().map(|m| (*m).to_string()).collect()
    }

    #[deny_unknown_arguments]
    pub fn get_owner(&self) -> AccountId {
        self.owner.to_account()
    }

    #[deny_unknown_arguments]
    pub fn get_owner_proposal(&self) -> Option<OwnerProposalView> {
        if !self.proposal_present {
            return None;
        }
        Some(OwnerProposalView {
            proposed: self.proposed_owner.to_account(),
            nonce: U64(self.proposal_nonce),
            expires_at_ns: U64(self.proposal_expiry_ns),
        })
    }

    /// Current owner proposes a successor. Acceptance must happen before expiry,
    /// and expiry is at most seven days out. Attaches exactly 1 yoctoNEAR.
    #[payable]
    #[deny_unknown_arguments]
    pub fn propose_owner(&mut self, new_owner: AccountId, expires_at_ns: U64) -> U64 {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let owner = self.owner.to_account();
        require!(caller == owner, "ERR_NOT_OWNER");
        require!(new_owner != owner, "ERR_BAD_ACCOUNT");
        let expires = expires_at_ns.0;
        let now = env::block_timestamp();
        require!(expires > now, "ERR_BAD_EXPIRY");
        require!(expires - now <= OWNER_PROPOSAL_MAX_NS, "ERR_BAD_EXPIRY");
        let nonce = self.proposal_nonce.checked_add(1).expect("ERR_OVERFLOW");
        self.proposal_nonce = nonce;
        self.proposal_present = true;
        self.proposed_owner = AccountSlot::from_account(&new_owner);
        self.proposal_expiry_ns = expires;
        RelayEvent::OwnerProposed(vec![OwnerProposedData {
            old_owner: owner,
            new_owner,
            proposal_nonce: U64(nonce),
            expires_at_ns: U64(expires),
        }])
        .emit();
        U64(nonce)
    }

    #[payable]
    #[deny_unknown_arguments]
    pub fn accept_owner(&mut self, proposal_nonce: U64) {
        assert_one_yocto();
        require!(self.proposal_present, "ERR_NO_PROPOSAL");
        require!(self.proposal_nonce == proposal_nonce.0, "ERR_BAD_NONCE");
        let proposed = self.proposed_owner.to_account();
        require!(
            env::predecessor_account_id() == proposed,
            "ERR_UNAUTHORIZED"
        );
        require!(
            env::block_timestamp() < self.proposal_expiry_ns,
            "ERR_EXPIRED"
        );
        let old = self.owner.to_account();
        self.owner = AccountSlot::from_account(&proposed);
        self.proposal_present = false;
        RelayEvent::OwnerChanged(vec![OwnerChangedData {
            old_owner: old,
            new_owner: proposed,
            proposal_nonce,
        }])
        .emit();
    }

    #[payable]
    #[deny_unknown_arguments]
    pub fn cancel_owner(&mut self, proposal_nonce: U64) {
        assert_one_yocto();
        require!(
            env::predecessor_account_id() == self.owner.to_account(),
            "ERR_NOT_OWNER"
        );
        require!(self.proposal_present, "ERR_NO_PROPOSAL");
        require!(self.proposal_nonce == proposal_nonce.0, "ERR_BAD_NONCE");
        let proposed = self.proposed_owner.to_account();
        self.proposal_present = false;
        RelayEvent::OwnerProposalCancelled(vec![OwnerProposalCancelledData {
            new_owner: proposed,
            proposal_nonce,
        }])
        .emit();
    }

    /// Owner registration. Insert only: a second call panics `ERR_ALREADY_REGISTERED`.
    /// The role stored here never changes. The attached deposit must cover the new
    /// row. Excess is refunded to the owner.
    #[payable]
    #[deny_unknown_arguments]
    pub fn register_actor(
        &mut self,
        account_id: AccountId,
        role: Role,
        display_name: String,
        enc_pubkey: String,
    ) {
        require!(
            env::predecessor_account_id() == self.owner.to_account(),
            "ERR_NOT_OWNER"
        );
        require!(
            self.actors.get(&account_id).is_none(),
            "ERR_ALREADY_REGISTERED"
        );
        let display_name = clean_name(&display_name);
        let enc_pubkey = decode_key(&enc_pubkey);
        let before = env::storage_usage();
        self.insert_actor(account_id.clone(), role, display_name, enc_pubkey);
        self.actors.flush();
        self.actor_at.flush();
        pay_storage(env::predecessor_account_id(), before);
        RelayEvent::ActorRegistered(vec![ActorRegisteredData {
            account_id,
            role: role.as_str().to_string(),
            self_registered: false,
        }])
        .emit();
    }

    /// Caller registers only itself as Patient and pays for that row.
    #[payable]
    #[deny_unknown_arguments]
    pub fn self_register_patient(&mut self, enc_pubkey: String) {
        let caller = env::predecessor_account_id();
        require!(
            !self.actors.contains_key(&caller),
            "ERR_ALREADY_REGISTERED"
        );
        let enc_pubkey = decode_key(&enc_pubkey);
        let before = env::storage_usage();
        self.insert_actor(caller.clone(), Role::Patient, "Patient".to_string(), enc_pubkey);
        self.actors.flush();
        self.actor_at.flush();
        pay_storage(caller.clone(), before);
        RelayEvent::ActorRegistered(vec![ActorRegisteredData {
            account_id: caller,
            role: Role::Patient.as_str().to_string(),
            self_registered: true,
        }])
        .emit();
    }

    /// Self-only. The owner cannot pass another account. Same key is a no-op.
    #[deny_unknown_arguments]
    pub fn rotate_enc_key(&mut self, enc_pubkey: String) {
        let caller = env::predecessor_account_id();
        let next = decode_key(&enc_pubkey);
        let (old, version, role_ok) = {
            let actor = self
                .actors
                .get(&caller)
                .unwrap_or_else(|| env::panic_str("ERR_NOT_REGISTERED"));
            require!(actor.active, "ERR_INACTIVE");
            (actor.enc_pubkey, actor.key_version, true)
        };
        let _ = role_ok;
        if old == next {
            return;
        }
        let version = version.checked_add(1).expect("ERR_OVERFLOW");
        {
            let actor = self.actors.get_mut(&caller).expect("ERR_NOT_REGISTERED");
            actor.enc_pubkey = next;
            actor.key_version = version;
        }
        RelayEvent::ActorUpdated(vec![ActorUpdatedData {
            account: caller,
            old_key_hash: encode_hex(&hash_bytes(&old)),
            new_key_hash: encode_hex(&hash_bytes(&next)),
            key_version: U64(version),
        }])
        .emit();
    }

    /// Context for envelopes. Derived from this contract, the caller, the method,
    /// and the request id. It does not use the numeric id this method would return.
    #[deny_unknown_arguments]
    pub fn encryption_context(
        &self,
        caller: AccountId,
        method: CreateMethod,
        request_id: String,
    ) -> String {
        let request_id = decode_hash(&request_id);
        encode_hex(&derive_context(
            &env::current_account_id(),
            &caller,
            method.tag(),
            &request_id,
        ))
    }

    #[deny_unknown_arguments]
    pub fn get_operation(
        &self,
        account_id: AccountId,
        method: CreateMethod,
        request_id: String,
    ) -> Option<OperationView> {
        let request_id_bytes = decode_hash(&request_id);
        self.operations
            .get(&(account_id.clone(), method.tag(), request_id_bytes))
            .map(|op| OperationView {
                account_id,
                method,
                request_id,
                result_id: U64(op.result_id),
            })
    }

    /// One bounded record row, one operation row, and the section slots.
    /// A repeated request id returns the original id and emits nothing.
    /// Function-call keys cannot attach a deposit, so this row is paid by the
    /// contract account and is bounded by the fixed section table. See DESIGN-V2.
    #[deny_unknown_arguments]
    pub fn create_record(
        &mut self,
        request_id: String,
        patient: AccountId,
        sections: Vec<SectionMeta>,
    ) -> U64 {
        let caller = env::predecessor_account_id();
        let request_id = decode_hash(&request_id);
        self.require_role(&caller, Role::Clinic);
        self.require_role(&patient, Role::Patient);
        let (mask, hashes) = clean_new_sections(sections);
        let args_hash = args_digest(M_RECORD, &record_bytes(&patient, mask, &hashes));
        if let Some(id) = self.replay(&caller, M_RECORD, &request_id, args_hash) {
            return U64(id);
        }
        let id = self.alloc_record_id();
        let now = env::block_timestamp();
        self.records.insert(
            id,
            Record {
                id,
                patient: patient.clone(),
                created_by: caller.clone(),
                section_present: mask_flags(mask),
                section_hash: hashes,
                created_at_ns: now,
                grant_epoch: 1,
                epoch_changed_at_ns: 0,
                share_count: 0,
                pending_count: 0,
                pending_slot: 0,
                open_count: 0,
                last_opened_ns: 0,
                patient_ticket: TicketSlot::empty(),
                clinic_ticket: TicketSlot::empty(),
            },
        );
        self.remember(&caller, M_RECORD, request_id, args_hash, id);
        RelayEvent::RecordCreated(vec![RecordCreatedData {
            record_id: U64(id),
            patient,
            created_by: caller,
            request_id: encode_hex(&request_id),
        }])
        .emit();
        U64(id)
    }

    #[deny_unknown_arguments]
    pub fn request_referral(
        &mut self,
        request_id: String,
        record_id: U64,
        expected_epoch: U64,
        to: AccountId,
        requested_sections: Vec<String>,
        purpose_hash: String,
    ) -> U64 {
        let caller = env::predecessor_account_id();
        let request_id = decode_hash(&request_id);
        let record_id = record_id.0;
        let purpose_hash = decode_hash(&purpose_hash);
        let record = self.record_clone(record_id);
        require!(record.created_by == caller, "ERR_UNAUTHORIZED");
        self.require_role(&caller, Role::Clinic);
        self.require_role(&to, Role::Clinic);
        require!(to != record.patient, "ERR_BAD_ROLE");
        let requested = mask_existing(&requested_sections, &record.section_present, false);
        let args_hash = args_digest(
            M_REFERRAL,
            &referral_bytes(record_id, expected_epoch.0, &to, requested, &purpose_hash),
        );
        if let Some(id) = self.replay(&caller, M_REFERRAL, &request_id, args_hash) {
            return U64(id);
        }
        require!(record.grant_epoch == expected_epoch.0, "ERR_BAD_EPOCH");
        require!(expected_epoch.0 >= 1, "ERR_BAD_EPOCH");
        let now = env::block_timestamp();
        let share_id = self.insert_share(Share::requested(
            record_id,
            record.grant_epoch,
            caller.clone(),
            to.clone(),
            requested,
            purpose_hash,
            now,
        ));
        self.remember(&caller, M_REFERRAL, request_id, args_hash, share_id);
        RelayEvent::ReferralRequested(vec![ReferralRequestedData {
            share_id: U64(share_id),
            record_id: U64(record_id),
            to,
            purpose_hash: encode_hex(&purpose_hash),
            request_id: encode_hex(&request_id),
        }])
        .emit();
        U64(share_id)
    }

    #[payable]
    #[deny_unknown_arguments]
    pub fn approve_share(
        &mut self,
        share_id: U64,
        granted_sections: Vec<String>,
        expires_at_ns: U64,
        read_only: bool,
        artifact_hash: String,
        tee_receipt_hash: String,
    ) {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let share_id = share_id.0;
        let share = self.share_clone(share_id);
        let record = self.record_clone(share.record_id);
        require!(caller == record.patient, "ERR_UNAUTHORIZED");
        require!(share.status == ShareStatus::Requested, "ERR_BAD_STATUS");
        require!(share.grant_epoch == record.grant_epoch, "ERR_REVOKED");
        let granted = subset_mask(&granted_sections, share.requested_mask);
        let expires = expires_at_ns.0;
        require_future_expiry(expires);
        let artifact_hash = decode_hash(&artifact_hash);
        let tee_receipt_hash = decode_hash(&tee_receipt_hash);
        let now = env::block_timestamp();
        self.unlink_pending(share_id);
        {
            let share = self.share_mut(share_id);
            share.granted_mask = granted;
            share.expires_at_ns = expires;
            share.read_only = read_only;
            share.artifact_present = true;
            share.artifact_hash = artifact_hash;
            share.tee_present = true;
            share.tee_receipt_hash = tee_receipt_hash;
            share.status = ShareStatus::Active;
            share.consented_at_ns = now;
        }
        let granted_names = mask_names(granted);
        RelayEvent::ShareConsented(vec![ShareConsentedData {
            share_id: U64(share_id),
            record_id: U64(record.id),
            granted_sections: granted_names,
            expires_at_ns: U64(expires),
            read_only,
        }])
        .emit();
        RelayEvent::ShareTransformed(vec![ShareTransformedData {
            share_id: U64(share_id),
            record_id: U64(record.id),
            artifact_hash: encode_hex(&artifact_hash),
            tee_receipt_hash: encode_hex(&tee_receipt_hash),
        }])
        .emit();
    }

    #[payable]
    #[deny_unknown_arguments]
    pub fn decline_share(&mut self, share_id: U64) {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let share_id = share_id.0;
        let share = self.share_clone(share_id);
        let patient = self.record_clone(share.record_id).patient;
        require!(caller == patient, "ERR_UNAUTHORIZED");
        require!(share.status == ShareStatus::Requested, "ERR_BAD_STATUS");
        require!(
            share.grant_epoch == self.record_clone(share.record_id).grant_epoch,
            "ERR_REVOKED"
        );
        self.unlink_pending(share_id);
        self.share_mut(share_id).status = ShareStatus::Declined;
        RelayEvent::ShareDeclined(vec![ShareDeclinedData {
            share_id: U64(share_id),
            record_id: U64(share.record_id),
        }])
        .emit();
    }

    /// Patient share. Exactly 1 yoctoNEAR, so a function-call key cannot call it.
    /// The new row is one fixed-size share plus index entries, paid by the
    /// contract account. See DESIGN-V2.
    #[payable]
    #[deny_unknown_arguments]
    pub fn create_share(
        &mut self,
        request_id: String,
        record_id: U64,
        expected_epoch: U64,
        to: AccountId,
        kind: ShareKind,
        sections: Vec<String>,
        expires_at_ns: Option<U64>,
        read_only: bool,
        purpose_hash: String,
        artifact_hash: String,
        tee_receipt_hash: Option<String>,
        parent: Option<U64>,
    ) -> U64 {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let request_id = decode_hash(&request_id);
        let record_id = record_id.0;
        let record = self.record_clone(record_id);
        require!(caller == record.patient, "ERR_UNAUTHORIZED");
        require!(
            matches!(
                kind,
                ShareKind::SecondOpinion | ShareKind::Transfer | ShareKind::DeidApp
            ),
            "ERR_BAD_STATUS"
        );
        let recipient = self.actor_clone(&to);
        require!(recipient.active, "ERR_INACTIVE");
        match kind {
            ShareKind::DeidApp => require!(recipient.role == Role::App, "ERR_BAD_ROLE"),
            ShareKind::SecondOpinion | ShareKind::Transfer => {
                require!(recipient.role == Role::Clinic, "ERR_BAD_ROLE");
            }
            _ => env::panic_str("ERR_BAD_STATUS"),
        }
        let allow_empty = matches!(kind, ShareKind::DeidApp);
        let granted = mask_existing(&sections, &record.section_present, allow_empty);
        let parent_id = parent.map(|value| value.0).unwrap_or(0);
        if parent_id != 0 {
            require!(
                self.share_clone(parent_id).record_id == record_id,
                "ERR_PARENT"
            );
        }
        let expires = expires_at_ns.map(|value| value.0).unwrap_or(0);
        if expires != 0 {
            require_future_expiry(expires);
        }
        let purpose_hash = decode_hash(&purpose_hash);
        let artifact_hash = decode_hash(&artifact_hash);
        let tee = tee_receipt_hash
            .as_ref()
            .map(|value| decode_hash(value));
        if matches!(kind, ShareKind::DeidApp) {
            require!(tee.is_some(), "ERR_NO_RECEIPT");
        }
        let args_hash = args_digest(
            M_SHARE,
            &share_bytes(
                record_id,
                expected_epoch.0,
                &to,
                kind.tag(),
                granted,
                expires,
                read_only,
                &purpose_hash,
                &artifact_hash,
                tee.as_ref(),
                parent_id,
            ),
        );
        if let Some(id) = self.replay(&caller, M_SHARE, &request_id, args_hash) {
            return U64(id);
        }
        require!(record.grant_epoch == expected_epoch.0, "ERR_BAD_EPOCH");
        require!(expected_epoch.0 >= 1, "ERR_BAD_EPOCH");
        let now = env::block_timestamp();
        let share_id = self.insert_share(Share::active(
            record_id,
            parent_id,
            record.grant_epoch,
            kind.clone(),
            caller.clone(),
            to.clone(),
            granted,
            purpose_hash,
            artifact_hash,
            tee,
            read_only,
            expires,
            now,
        ));
        self.remember(&caller, M_SHARE, request_id, args_hash, share_id);
        RelayEvent::ShareCreated(vec![ShareCreatedData {
            share_id: U64(share_id),
            record_id: U64(record_id),
            kind: kind.as_str().to_string(),
            to,
            parent,
            request_id: encode_hex(&request_id),
        }])
        .emit();
        U64(share_id)
    }

    /// Replaces the open ticket in a slot that was allocated with the share.
    /// Does not append history. `open_count` and `last_opened_ns` are fixed fields.
    #[deny_unknown_arguments]
    pub fn request_open(&mut self, share_id: U64, nonce_hash: String) {
        let caller = env::predecessor_account_id();
        let share_id = share_id.0;
        let nonce = decode_hash(&nonce_hash);
        let share = self.share_clone(share_id);
        let patient = self.record_clone(share.record_id).patient;
        require!(caller == share.to || caller == patient, "ERR_UNAUTHORIZED");
        self.assert_share_openable(share_id);
        let now = env::block_timestamp();
        {
            let share = self.share_mut(share_id);
            share.open_count = share.open_count.checked_add(1).expect("ERR_OVERFLOW");
            share.last_opened_ns = now;
            let slot = TicketSlot {
                present: true,
                nonce,
                at_ns: now,
            };
            if caller == patient {
                share.patient_ticket = slot;
            } else {
                share.recipient_ticket = slot;
            }
        }
        RelayEvent::ShareOpened(vec![ShareOpenedData {
            share_id: U64(share_id),
            record_id: U64(share.record_id),
            nonce_hash: encode_hex(&nonce),
        }])
        .emit();
    }

    #[deny_unknown_arguments]
    pub fn request_owner_open(&mut self, record_id: U64, nonce_hash: String) {
        let caller = env::predecessor_account_id();
        let record_id = record_id.0;
        let record = self.record_clone(record_id);
        require!(
            caller == record.patient || caller == record.created_by,
            "ERR_UNAUTHORIZED"
        );
        let nonce = decode_hash(&nonce_hash);
        let now = env::block_timestamp();
        {
            let record = self.record_mut(record_id);
            record.open_count = record.open_count.checked_add(1).expect("ERR_OVERFLOW");
            record.last_opened_ns = now;
            let slot = TicketSlot {
                present: true,
                nonce,
                at_ns: now,
            };
            if caller == record.patient {
                record.patient_ticket = slot;
            } else {
                record.clinic_ticket = slot;
            }
        }
        RelayEvent::RecordOpened(vec![RecordOpenedData {
            record_id: U64(record_id),
            nonce_hash: encode_hex(&nonce),
        }])
        .emit();
    }

    #[deny_unknown_arguments]
    pub fn submit_reply(
        &mut self,
        request_id: String,
        share_id: U64,
        expected_epoch: U64,
        reply_hash: String,
    ) -> U64 {
        let caller = env::predecessor_account_id();
        let request_id = decode_hash(&request_id);
        let share_id = share_id.0;
        let reply_hash = decode_hash(&reply_hash);
        let share = self.share_clone(share_id);
        require!(caller == share.to, "ERR_UNAUTHORIZED");
        require!(
            matches!(share.kind, ShareKind::Referral | ShareKind::SecondOpinion),
            "ERR_BAD_STATUS"
        );
        let record = self.record_clone(share.record_id);
        let args_hash = args_digest(
            M_REPLY,
            &reply_bytes(share_id, expected_epoch.0, &reply_hash),
        );
        if let Some(id) = self.replay(&caller, M_REPLY, &request_id, args_hash) {
            return U64(id);
        }
        self.assert_share_openable(share_id);
        require!(record.grant_epoch == expected_epoch.0, "ERR_BAD_EPOCH");
        require!(expected_epoch.0 >= 1, "ERR_BAD_EPOCH");
        let now = env::block_timestamp();
        let reply_id = self.insert_share(Share::active(
            share.record_id,
            share_id,
            record.grant_epoch,
            ShareKind::Reply,
            caller.clone(),
            record.patient.clone(),
            0,
            reply_hash,
            reply_hash,
            None,
            true,
            0,
            now,
        ));
        self.remember(&caller, M_REPLY, request_id, args_hash, reply_id);
        RelayEvent::ReplySubmitted(vec![ReplySubmittedData {
            share_id: U64(share_id),
            reply_share_id: U64(reply_id),
            record_id: U64(share.record_id),
            reply_hash: encode_hex(&reply_hash),
            request_id: encode_hex(&request_id),
        }])
        .emit();
        U64(reply_id)
    }

    #[payable]
    #[deny_unknown_arguments]
    pub fn revoke_share(&mut self, share_id: U64) {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let share_id = share_id.0;
        let share = self.share_clone(share_id);
        let record = self.record_clone(share.record_id);
        require!(caller == record.patient, "ERR_UNAUTHORIZED");
        require!(
            matches!(share.status, ShareStatus::Active | ShareStatus::Requested),
            "ERR_BAD_STATUS"
        );
        if share.grant_epoch == record.grant_epoch && share.in_pending {
            self.unlink_pending(share_id);
        }
        let now = env::block_timestamp();
        {
            let share = self.share_mut(share_id);
            share.status = ShareStatus::Revoked;
            share.revoked_at_ns = now;
            share.in_pending = false;
        }
        RelayEvent::ShareRevoked(vec![ShareRevokedData {
            share_id: U64(share_id),
            record_id: U64(share.record_id),
        }])
        .emit();
    }

    /// Bumps the record grant epoch by one. Shares, children, and replies created
    /// under an older epoch are effectively revoked. The call does not walk them.
    /// `expected_epoch` must be the current epoch. The next epoch means this
    /// revoke already happened. Zero and any other value panic `ERR_BAD_EPOCH`.
    #[payable]
    #[deny_unknown_arguments]
    pub fn revoke_all_for_record(&mut self, record_id: U64, expected_epoch: U64) -> U64 {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let record_id = record_id.0;
        let record = self.record_clone(record_id);
        require!(caller == record.patient, "ERR_UNAUTHORIZED");
        let expected = expected_epoch.0;
        require!(expected >= 1, "ERR_BAD_EPOCH");
        if record.grant_epoch == expected.checked_add(1).expect("ERR_OVERFLOW") {
            return U64(record.grant_epoch);
        }
        require!(record.grant_epoch == expected, "ERR_BAD_EPOCH");
        let new_epoch = record.grant_epoch.checked_add(1).expect("ERR_OVERFLOW");
        if record.pending_count > 0 {
            let count = i64::try_from(record.pending_count).expect("ERR_OVERFLOW");
            self.fenwick_add(&record.patient, record.pending_slot, -count);
        }
        let now = env::block_timestamp();
        {
            let record = self.record_mut(record_id);
            record.grant_epoch = new_epoch;
            record.pending_count = 0;
            record.epoch_changed_at_ns = now;
        }
        RelayEvent::RecordGrantsRevoked(vec![RecordGrantsRevokedData {
            record_id: U64(record_id),
            old_epoch: U64(expected),
            new_epoch: U64(new_epoch),
        }])
        .emit();
        U64(new_epoch)
    }

    #[deny_unknown_arguments]
    pub fn get_actor(&self, account_id: AccountId) -> Option<ActorView> {
        self.actors
            .get(&account_id)
            .map(|actor| actor_view(account_id, actor))
    }

    #[deny_unknown_arguments]
    pub fn list_actors(&self, from_index: u32, limit: u32) -> Vec<ActorView> {
        let limit = page_limit(limit);
        if limit == 0 {
            return Vec::new();
        }
        let total = self.actor_count;
        let mut out = Vec::new();
        let mut index = u64::from(from_index);
        while out.len() < limit && index < total {
            let Some(account_id) = self.actor_at.get(&index).cloned() else {
                index += 1;
                continue;
            };
            if let Some(actor) = self.actors.get(&account_id) {
                out.push(actor_view(account_id, actor));
            }
            index += 1;
        }
        out
    }

    #[deny_unknown_arguments]
    pub fn get_record(&self, record_id: U64) -> Option<RecordView> {
        self.records.get(&record_id.0).map(record_view)
    }

    #[deny_unknown_arguments]
    pub fn get_share(&self, share_id: U64) -> Option<ShareView> {
        self.shares
            .get(&share_id.0)
            .cloned()
            .map(|share| self.share_view(&share))
    }

    #[deny_unknown_arguments]
    pub fn list_shares_for_record(
        &self,
        record_id: U64,
        from_index: u32,
        limit: u32,
    ) -> Vec<ShareView> {
        let limit = page_limit(limit);
        if limit == 0 {
            return Vec::new();
        }
        let Some(total) = self.records.get(&record_id.0).map(|record| record.share_count) else {
            return Vec::new();
        };
        let mut out = Vec::new();
        let mut index = u64::from(from_index);
        while out.len() < limit && index < total {
            if let Some(share_id) = self.record_share_at.get(&(record_id.0, index)).copied() {
                if let Some(share) = self.shares.get(&share_id).cloned() {
                    out.push(self.share_view(&share));
                }
            }
            index += 1;
        }
        out
    }

    #[deny_unknown_arguments]
    pub fn list_shares_for_recipient(
        &self,
        account_id: AccountId,
        from_index: u32,
        limit: u32,
    ) -> Vec<ShareView> {
        let limit = page_limit(limit);
        if limit == 0 {
            return Vec::new();
        }
        let Some(total) = self.actors.get(&account_id).map(|actor| actor.received_count) else {
            return Vec::new();
        };
        let mut out = Vec::new();
        let mut index = u64::from(from_index);
        while out.len() < limit && index < total {
            if let Some(share_id) = self
                .recipient_share_at
                .get(&(account_id.clone(), index))
                .copied()
            {
                if let Some(share) = self.shares.get(&share_id).cloned() {
                    out.push(self.share_view(&share));
                }
            }
            index += 1;
        }
        out
    }

    /// Pending shares for this patient only, in index order. Other patients'
    /// records are not read. Limit is capped at 50.
    #[deny_unknown_arguments]
    pub fn list_pending_for_patient(
        &self,
        patient: AccountId,
        from_index: u32,
        limit: u32,
    ) -> Vec<ShareView> {
        let limit = page_limit(limit);
        if limit == 0 || self.actors.get(&patient).is_none() {
            return Vec::new();
        }
        let mut out = Vec::new();
        let mut index = u64::from(from_index);
        while out.len() < limit {
            let Some((slot, local)) = self.locate_pending(&patient, index) else {
                break;
            };
            let Some(record_id) = self
                .pending_slot_record
                .get(&(patient.clone(), slot))
                .copied()
            else {
                break;
            };
            let Some(epoch) = self.records.get(&record_id).map(|record| record.grant_epoch) else {
                break;
            };
            let Some(share_id) = self.pending_at.get(&(record_id, epoch, local)).copied() else {
                break;
            };
            let Some(share) = self.shares.get(&share_id).cloned() else {
                break;
            };
            out.push(self.share_view(&share));
            index += 1;
        }
        out
    }

    #[deny_unknown_arguments]
    pub fn check_ticket(&self, share_id: U64, account_id: AccountId, nonce_hash: String) -> bool {
        let Ok(nonce) = try_decode_hash(&nonce_hash) else {
            return false;
        };
        let Some(share) = self.shares.get(&share_id.0).cloned() else {
            return false;
        };
        if self.effective(&share) != EffectiveStatus::Active {
            return false;
        }
        let slot = if account_id == share.to {
            &share.recipient_ticket
        } else {
            &share.patient_ticket
        };
        ticket_fresh(slot, &nonce)
    }

    #[deny_unknown_arguments]
    pub fn check_record_ticket(
        &self,
        record_id: U64,
        account_id: AccountId,
        nonce_hash: String,
    ) -> bool {
        let Ok(nonce) = try_decode_hash(&nonce_hash) else {
            return false;
        };
        let Some(record) = self.records.get(&record_id.0) else {
            return false;
        };
        let slot = if account_id == record.patient {
            &record.patient_ticket
        } else if account_id == record.created_by {
            &record.clinic_ticket
        } else {
            return false;
        };
        ticket_fresh(slot, &nonce)
    }
}

impl Share {
    fn requested(
        record_id: u64,
        grant_epoch: u64,
        initiator: AccountId,
        to: AccountId,
        requested_mask: u8,
        purpose_hash: [u8; 32],
        now: u64,
    ) -> Self {
        Self {
            id: 0,
            record_id,
            parent: 0,
            kind: ShareKind::Referral,
            initiator,
            to,
            requested_mask,
            granted_mask: 0,
            purpose_hash,
            artifact_present: false,
            artifact_hash: [0u8; 32],
            tee_present: false,
            tee_receipt_hash: [0u8; 32],
            read_only: true,
            expires_at_ns: 0,
            status: ShareStatus::Requested,
            created_at_ns: now,
            consented_at_ns: 0,
            revoked_at_ns: 0,
            grant_epoch,
            open_count: 0,
            last_opened_ns: 0,
            recipient_ticket: TicketSlot::empty(),
            patient_ticket: TicketSlot::empty(),
            in_pending: true,
            pending_index: 0,
        }
    }

    fn active(
        record_id: u64,
        parent: u64,
        grant_epoch: u64,
        kind: ShareKind,
        initiator: AccountId,
        to: AccountId,
        mask: u8,
        purpose_hash: [u8; 32],
        artifact_hash: [u8; 32],
        tee: Option<[u8; 32]>,
        read_only: bool,
        expires_at_ns: u64,
        now: u64,
    ) -> Self {
        Self {
            id: 0,
            record_id,
            parent,
            kind,
            initiator,
            to,
            requested_mask: mask,
            granted_mask: mask,
            purpose_hash,
            artifact_present: true,
            artifact_hash,
            tee_present: tee.is_some(),
            tee_receipt_hash: tee.unwrap_or([0u8; 32]),
            read_only,
            expires_at_ns,
            status: ShareStatus::Active,
            created_at_ns: now,
            consented_at_ns: now,
            revoked_at_ns: 0,
            grant_epoch,
            open_count: 0,
            last_opened_ns: 0,
            recipient_ticket: TicketSlot::empty(),
            patient_ticket: TicketSlot::empty(),
            in_pending: false,
            pending_index: 0,
        }
    }
}

impl Contract {
    fn insert_actor(
        &mut self,
        account_id: AccountId,
        role: Role,
        display_name: String,
        enc_pubkey: [u8; 32],
    ) {
        let index = self.actor_count;
        self.actor_count = self.actor_count.checked_add(1).expect("ERR_OVERFLOW");
        self.actor_at.insert(index, account_id.clone());
        self.actors.insert(
            account_id,
            Actor {
                role,
                display_name,
                enc_pubkey,
                active: true,
                key_version: 1,
                received_count: 0,
                pending_slots: 0,
            },
        );
    }

    fn require_role(&self, account_id: &AccountId, role: Role) {
        let actor = self
            .actors
            .get(account_id)
            .unwrap_or_else(|| env::panic_str("ERR_NOT_REGISTERED"));
        require!(actor.active, "ERR_INACTIVE");
        require!(actor.role == role, "ERR_BAD_ROLE");
    }

    fn actor_clone(&self, account_id: &AccountId) -> Actor {
        self.actors
            .get(account_id)
            .unwrap_or_else(|| env::panic_str("ERR_NOT_REGISTERED"))
            .clone()
    }

    fn record_clone(&self, record_id: u64) -> Record {
        self.records
            .get(&record_id)
            .unwrap_or_else(|| env::panic_str("ERR_NOT_FOUND"))
            .clone()
    }

    fn record_mut(&mut self, record_id: u64) -> &mut Record {
        self.records
            .get_mut(&record_id)
            .unwrap_or_else(|| env::panic_str("ERR_NOT_FOUND"))
    }

    fn share_clone(&self, share_id: u64) -> Share {
        self.shares
            .get(&share_id)
            .unwrap_or_else(|| env::panic_str("ERR_NOT_FOUND"))
            .clone()
    }

    fn share_mut(&mut self, share_id: u64) -> &mut Share {
        self.shares
            .get_mut(&share_id)
            .unwrap_or_else(|| env::panic_str("ERR_NOT_FOUND"))
    }

    fn alloc_record_id(&mut self) -> u64 {
        let id = self.next_record_id;
        self.next_record_id = self.next_record_id.checked_add(1).expect("ERR_OVERFLOW");
        id
    }

    fn replay(
        &self,
        caller: &AccountId,
        method: u8,
        request_id: &[u8; 32],
        args_hash: [u8; 32],
    ) -> Option<u64> {
        let Some(op) = self
            .operations
            .get(&(caller.clone(), method, *request_id))
        else {
            return None;
        };
        require!(op.args_hash == args_hash, "ERR_REQUEST_ID_CONFLICT");
        Some(op.result_id)
    }

    fn remember(
        &mut self,
        caller: &AccountId,
        method: u8,
        request_id: [u8; 32],
        args_hash: [u8; 32],
        result_id: u64,
    ) {
        self.operations.insert(
            (caller.clone(), method, request_id),
            Operation {
                args_hash,
                result_id,
            },
        );
    }

    fn insert_share(&mut self, mut share: Share) -> u64 {
        let id = self.next_share_id;
        self.next_share_id = self.next_share_id.checked_add(1).expect("ERR_OVERFLOW");
        share.id = id;
        let record_id = share.record_id;
        let to = share.to.clone();
        let pending = share.in_pending;
        let epoch = share.grant_epoch;
        let index = {
            let record = self.record_mut(record_id);
            let index = record.share_count;
            record.share_count = record.share_count.checked_add(1).expect("ERR_OVERFLOW");
            index
        };
        self.record_share_at.insert((record_id, index), id);
        let received = {
            let actor = self
                .actors
                .get_mut(&to)
                .unwrap_or_else(|| env::panic_str("ERR_NOT_REGISTERED"));
            let received = actor.received_count;
            actor.received_count = actor.received_count.checked_add(1).expect("ERR_OVERFLOW");
            received
        };
        self.recipient_share_at.insert((to, received), id);
        if pending {
            let local = {
                let record = self.record_mut(record_id);
                let local = record.pending_count;
                record.pending_count = record.pending_count.checked_add(1).expect("ERR_OVERFLOW");
                local
            };
            share.pending_index = local;
            let slot = self.ensure_pending_slot(record_id);
            let patient = self.record_clone(record_id).patient;
            self.pending_at.insert((record_id, epoch, local), id);
            self.fenwick_add(&patient, slot, 1);
        }
        self.shares.insert(id, share);
        id
    }

    fn ensure_pending_slot(&mut self, record_id: u64) -> u64 {
        let existing = self.record_clone(record_id).pending_slot;
        if existing != 0 {
            return existing;
        }
        let patient = self.record_clone(record_id).patient;
        let next = {
            let actor = self
                .actors
                .get_mut(&patient)
                .unwrap_or_else(|| env::panic_str("ERR_NOT_REGISTERED"));
            let next = actor.pending_slots.checked_add(1).expect("ERR_OVERFLOW");
            require!(next <= FENWICK_MAX, "ERR_OVERFLOW");
            actor.pending_slots = next;
            next
        };
        self.record_mut(record_id).pending_slot = next;
        self.pending_slot_record.insert((patient, next), record_id);
        next
    }

    fn unlink_pending(&mut self, share_id: u64) {
        let share = self.share_clone(share_id);
        if !share.in_pending {
            return;
        }
        let record = self.record_clone(share.record_id);
        if share.grant_epoch != record.grant_epoch || record.pending_count == 0 {
            self.share_mut(share_id).in_pending = false;
            return;
        }
        let last = record.pending_count - 1;
        if share.pending_index != last {
            let moved = self
                .pending_at
                .get(&(share.record_id, share.grant_epoch, last))
                .copied()
                .unwrap_or_else(|| env::panic_str("ERR_NOT_FOUND"));
            self.pending_at.insert(
                (share.record_id, share.grant_epoch, share.pending_index),
                moved,
            );
            self.share_mut(moved).pending_index = share.pending_index;
        }
        self.pending_at
            .remove(&(share.record_id, share.grant_epoch, last));
        self.record_mut(share.record_id).pending_count = last;
        self.share_mut(share_id).in_pending = false;
        self.fenwick_add(&record.patient, record.pending_slot, -1);
    }

    fn fenwick_get(&self, patient: &AccountId, idx: u64) -> u64 {
        self.fenwick
            .get(&(patient.clone(), idx))
            .copied()
            .unwrap_or(0)
    }

    fn fenwick_add(&mut self, patient: &AccountId, mut idx: u64, delta: i64) {
        require!(idx >= 1 && idx <= FENWICK_MAX, "ERR_OVERFLOW");
        while idx <= FENWICK_MAX {
            let key = (patient.clone(), idx);
            let cur = self.fenwick.get(&key).copied().unwrap_or(0);
            let next = if delta >= 0 {
                cur.checked_add(delta as u64).expect("ERR_OVERFLOW")
            } else {
                cur.checked_sub(delta.unsigned_abs()).expect("ERR_OVERFLOW")
            };
            self.fenwick.insert(key, next);
            let step = idx & idx.wrapping_neg();
            idx = match idx.checked_add(step) {
                Some(value) => value,
                None => break,
            };
        }
    }

    fn fenwick_prefix(&self, patient: &AccountId, mut idx: u64) -> u64 {
        let mut sum = 0u64;
        while idx > 0 {
            sum = sum
                .checked_add(self.fenwick_get(patient, idx))
                .expect("ERR_OVERFLOW");
            idx -= idx & idx.wrapping_neg();
        }
        sum
    }

    /// 0-based flat index -> (slot, local index in that record's current epoch).
    fn locate_pending(&self, patient: &AccountId, flat_index: u64) -> Option<(u64, u64)> {
        let total = self.fenwick_prefix(patient, FENWICK_MAX);
        let mut target = flat_index.checked_add(1)?;
        if target > total {
            return None;
        }
        let mut idx = 0u64;
        let mut bit = FENWICK_MAX / 2;
        while bit > 0 {
            let next = idx + bit;
            if next <= FENWICK_MAX {
                let value = self.fenwick_get(patient, next);
                if value < target {
                    idx = next;
                    target -= value;
                }
            }
            bit >>= 1;
        }
        Some((idx + 1, target - 1))
    }

    fn effective(&self, share: &Share) -> EffectiveStatus {
        let epoch = self
            .records
            .get(&share.record_id)
            .map(|record| record.grant_epoch)
            .unwrap_or(share.grant_epoch);
        effective_status(share, epoch, env::block_timestamp())
    }

    fn share_view(&self, share: &Share) -> ShareView {
        ShareView {
            id: U64(share.id),
            record_id: U64(share.record_id),
            parent: nonzero_u64(share.parent),
            kind: share.kind.clone(),
            initiator: share.initiator.clone(),
            to: share.to.clone(),
            requested_sections: mask_names(share.requested_mask),
            granted_sections: mask_names(share.granted_mask),
            purpose_hash: encode_hex(&share.purpose_hash),
            artifact_hash: share
                .artifact_present
                .then(|| encode_hex(&share.artifact_hash)),
            tee_receipt_hash: share
                .tee_present
                .then(|| encode_hex(&share.tee_receipt_hash)),
            read_only: share.read_only,
            expires_at_ns: nonzero_u64(share.expires_at_ns),
            status: share.status,
            effective_status: self.effective(share),
            created_at_ns: U64(share.created_at_ns),
            consented_at_ns: nonzero_u64(share.consented_at_ns),
            revoked_at_ns: nonzero_u64(share.revoked_at_ns),
            open_count: share.open_count,
            last_opened_ns: nonzero_u64(share.last_opened_ns),
            grant_epoch: U64(share.grant_epoch),
        }
    }

    fn assert_share_openable(&self, share_id: u64) {
        let share = self.share_clone(share_id);
        match self.effective(&share) {
            EffectiveStatus::Active => {}
            EffectiveStatus::Revoked => env::panic_str("ERR_REVOKED"),
            EffectiveStatus::Expired => env::panic_str("ERR_EXPIRED"),
            _ => env::panic_str("ERR_BAD_STATUS"),
        }
    }
}

fn actor_view(account_id: AccountId, actor: &Actor) -> ActorView {
    ActorView {
        account_id,
        role: actor.role,
        display_name: actor.display_name.clone(),
        enc_pubkey: encode_hex(&actor.enc_pubkey),
        active: actor.active,
        key_version: U64(actor.key_version),
    }
}

fn record_view(record: &Record) -> RecordView {
    RecordView {
        id: U64(record.id),
        patient: record.patient.clone(),
        created_by: record.created_by.clone(),
        sections: section_list(record),
        created_at_ns: U64(record.created_at_ns),
        grant_epoch: U64(record.grant_epoch),
        share_count: U64(record.share_count),
        open_count: record.open_count,
        last_opened_ns: nonzero_u64(record.last_opened_ns),
        epoch_changed_at_ns: nonzero_u64(record.epoch_changed_at_ns),
    }
}

fn section_list(record: &Record) -> Vec<SectionMeta> {
    let mut out = Vec::new();
    for index in 0..SECTION_KEYS.len() {
        if record.section_present[index] {
            out.push(SectionMeta {
                key: SECTION_KEYS[index].to_string(),
                cipher_hash: encode_hex(&record.section_hash[index]),
            });
        }
    }
    out
}

fn effective_status(share: &Share, record_epoch: u64, now: u64) -> EffectiveStatus {
    if share.grant_epoch < record_epoch && share.status != ShareStatus::Declined {
        return EffectiveStatus::Revoked;
    }
    match share.status {
        ShareStatus::Active if share.expires_at_ns != 0 && now > share.expires_at_ns => {
            EffectiveStatus::Expired
        }
        ShareStatus::Active => EffectiveStatus::Active,
        ShareStatus::Requested => EffectiveStatus::Requested,
        ShareStatus::Declined => EffectiveStatus::Declined,
        ShareStatus::Revoked => EffectiveStatus::Revoked,
    }
}

fn ticket_fresh(slot: &TicketSlot, nonce: &[u8; 32]) -> bool {
    slot.present
        && slot.nonce == *nonce
        && env::block_timestamp().saturating_sub(slot.at_ns) <= TICKET_TTL_NS
}

fn nonzero_u64(value: u64) -> Option<U64> {
    if value == 0 { None } else { Some(U64(value)) }
}

fn page_limit(limit: u32) -> usize {
    limit.min(PAGE_MAX) as usize
}

fn require_future_expiry(expires_at_ns: u64) {
    let now = env::block_timestamp();
    require!(expires_at_ns > now, "ERR_BAD_EXPIRY");
    require!(expires_at_ns - now <= MAX_EXPIRY_NS, "ERR_BAD_EXPIRY");
}

fn pay_storage(payer: AccountId, before: u64) {
    let used = env::storage_usage().saturating_sub(before);
    let required = env::storage_byte_cost().saturating_mul(u128::from(used));
    let attached = env::attached_deposit();
    require!(attached >= required, "ERR_STORAGE");
    let refund = attached.saturating_sub(required);
    if refund > NearToken::from_yoctonear(0) {
        Promise::new(payer).transfer(refund).detach();
    }
}

fn clean_name(name: &str) -> String {
    let name = name.trim();
    let chars = name.chars().count();
    require!((1..=MAX_NAME_CHARS).contains(&chars), "ERR_BAD_NAME");
    require!(!name.chars().any(|c| c.is_control()), "ERR_BAD_NAME");
    require!(is_org_label(name), "ERR_BAD_NAME");
    name.to_string()
}

fn is_org_label(name: &str) -> bool {
    let tokens: Vec<&str> = name.split_whitespace().collect();
    if tokens.is_empty() {
        return false;
    }
    const ORG: &[&str] = &[
        "clinic", "hospital", "institute", "medicine", "general", "health", "center", "centre", "app",
    ];
    let org_hit = tokens.iter().any(|token| {
        let bare = token
            .trim_matches(|c: char| !c.is_ascii_alphabetic())
            .to_ascii_lowercase();
        ORG.contains(&bare.as_str())
    });
    const PEOPLE: [&str; 12] = [
        "maya", "okafor", "quinlan", "voss", "lena", "park", "reyes", "sofia", "arjun", "mehta", "priya", "raman",
    ];
    let mut personal = false;
    for token in &tokens {
        let bare = token
            .trim_matches(|c: char| !c.is_ascii_alphabetic())
            .to_ascii_lowercase();
        if PEOPLE.contains(&bare.as_str()) {
            personal = true;
        }
    }
    if personal {
        return false;
    }
    if org_hit {
        return true;
    }
    let single = tokens.len() == 1 && tokens[0].chars().all(|c| c.is_ascii_alphanumeric());
    if !single {
        return false;
    }
    let label = tokens[0].to_ascii_lowercase();
    label == "patient" || label == "pulsefit" || ORG.contains(&label.as_str())
}

fn decode_hash(value: &str) -> [u8; 32] {
    try_decode_hash(value).unwrap_or_else(|_| env::panic_str("ERR_BAD_HASH"))
}

fn decode_key(value: &str) -> [u8; 32] {
    try_decode_hash(value).unwrap_or_else(|_| env::panic_str("ERR_BAD_KEY"))
}

fn try_decode_hash(value: &str) -> Result<[u8; 32], ()> {
    if value.len() != HASH_LEN || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(());
    }
    let mut out = [0u8; 32];
    let bytes = value.as_bytes();
    for index in 0..32 {
        let hi = hex_value(bytes[index * 2])?;
        let lo = hex_value(bytes[index * 2 + 1])?;
        out[index] = (hi << 4) | lo;
    }
    Ok(out)
}

fn hex_value(byte: u8) -> Result<u8, ()> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err(()),
    }
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn hash_bytes(bytes: &[u8]) -> [u8; 32] {
    let digest = env::sha256(bytes);
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    out
}

fn args_digest(method: u8, body: &[u8]) -> [u8; 32] {
    let mut preimage = Vec::with_capacity(24 + body.len());
    preimage.extend_from_slice(b"referral_relay/v2/args\0");
    preimage.push(method);
    preimage.extend_from_slice(body);
    hash_bytes(&preimage)
}

fn record_bytes(patient: &AccountId, mask: u8, hashes: &[[u8; 32]; 5]) -> Vec<u8> {
    let mut out = Vec::new();
    push_borsh_str(&mut out, patient.as_str());
    out.push(mask);
    for hash in hashes {
        out.extend_from_slice(hash);
    }
    out
}

fn referral_bytes(
    record_id: u64,
    expected_epoch: u64,
    to: &AccountId,
    mask: u8,
    purpose: &[u8; 32],
) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&record_id.to_le_bytes());
    out.extend_from_slice(&expected_epoch.to_le_bytes());
    push_borsh_str(&mut out, to.as_str());
    out.push(mask);
    out.extend_from_slice(purpose);
    out
}

fn share_bytes(
    record_id: u64,
    expected_epoch: u64,
    to: &AccountId,
    kind: u8,
    mask: u8,
    expires: u64,
    read_only: bool,
    purpose: &[u8; 32],
    artifact: &[u8; 32],
    tee: Option<&[u8; 32]>,
    parent: u64,
) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&record_id.to_le_bytes());
    out.extend_from_slice(&expected_epoch.to_le_bytes());
    push_borsh_str(&mut out, to.as_str());
    out.push(kind);
    out.push(mask);
    out.extend_from_slice(&expires.to_le_bytes());
    out.push(u8::from(read_only));
    out.extend_from_slice(purpose);
    out.extend_from_slice(artifact);
    out.push(u8::from(tee.is_some()));
    out.extend_from_slice(tee.unwrap_or(&[0u8; 32]));
    out.extend_from_slice(&parent.to_le_bytes());
    out
}

fn reply_bytes(share_id: u64, expected_epoch: u64, reply: &[u8; 32]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&share_id.to_le_bytes());
    out.extend_from_slice(&expected_epoch.to_le_bytes());
    out.extend_from_slice(reply);
    out
}

fn clean_new_sections(sections: Vec<SectionMeta>) -> (u8, [[u8; 32]; 5]) {
    require!(
        !sections.is_empty() && sections.len() <= SECTION_KEYS.len(),
        "ERR_BAD_SECTION"
    );
    let mut mask = 0u8;
    let mut hashes = [[0u8; 32]; 5];
    for section in sections {
        let bit = section_bit(&section.key);
        require!(mask & (1 << bit) == 0, "ERR_DUPLICATE");
        mask |= 1 << bit;
        hashes[bit as usize] = decode_hash(&section.cipher_hash);
    }
    (mask, hashes)
}

fn mask_existing(requested: &[String], present: &[bool; 5], allow_empty: bool) -> u8 {
    if allow_empty && requested.is_empty() {
        return 0;
    }
    require!(
        !requested.is_empty() && requested.len() <= SECTION_KEYS.len(),
        "ERR_BAD_SECTION"
    );
    let mut mask = 0u8;
    for key in requested {
        let bit = section_bit(key);
        require!(present[bit as usize], "ERR_BAD_SECTION");
        require!(mask & (1 << bit) == 0, "ERR_DUPLICATE");
        mask |= 1 << bit;
    }
    mask
}

fn subset_mask(granted: &[String], requested: u8) -> u8 {
    require!(granted.len() <= SECTION_KEYS.len(), "ERR_TOO_MANY");
    let mut mask = 0u8;
    for key in granted {
        let bit = section_bit(key);
        require!(requested & (1 << bit) != 0, "ERR_BAD_SECTION");
        require!(mask & (1 << bit) == 0, "ERR_DUPLICATE");
        mask |= 1 << bit;
    }
    mask
}

fn section_bit(key: &str) -> u8 {
    SECTION_KEYS
        .iter()
        .position(|item| *item == key)
        .unwrap_or_else(|| env::panic_str("ERR_BAD_SECTION")) as u8
}

fn mask_flags(mask: u8) -> [bool; 5] {
    let mut flags = [false; 5];
    for index in 0..5 {
        flags[index] = mask & (1 << index) != 0;
    }
    flags
}

fn mask_names(mask: u8) -> Vec<String> {
    let mut out = Vec::new();
    for (index, key) in SECTION_KEYS.iter().enumerate() {
        if mask & (1 << index) != 0 {
            out.push((*key).to_string());
        }
    }
    out
}

#[cfg(test)]
mod unit_tests;
