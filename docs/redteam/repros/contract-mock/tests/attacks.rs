//! Access-control attacks against the TendAI Custody contract.
//!
//! These run in the near-sdk mock runtime (testing_env), which executes the
//! contract methods the same way the crate's unit tests do. They do not start
//! near-sandbox and they do not send transactions.

use near_sdk::json_types::U64;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{AccountId, NearToken, testing_env};
use referral_relay::{Contract, EffectiveStatus, Role, SectionMeta, ShareKind, ShareStatus};

const T0: u64 = 1_700_000_000_000_000_000;
const DAY: u64 = 24 * 60 * 60 * 1_000_000_000;
const SEC: u64 = 1_000_000_000;

fn aid(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn hex_byte(byte: u8) -> String {
    format!("{byte:02x}").repeat(32)
}

fn set_env(predecessor: &str, signer: &str, yocto: u128, timestamp: u64) {
    let predecessor = aid(predecessor);
    let signer = aid(signer);
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(aid("relay.sandbox"))
        .signer_account_id(signer)
        .predecessor_account_id(predecessor)
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .block_timestamp(timestamp);
    testing_env!(builder.build());
}

fn as_caller(caller: &str, yocto: u128, timestamp: u64) {
    set_env(caller, caller, yocto, timestamp);
}

fn sections() -> Vec<SectionMeta> {
    vec![
        SectionMeta {
            key: "history".into(),
            cipher_hash: hex_byte(0x11),
        },
        SectionMeta {
            key: "notes".into(),
            cipher_hash: hex_byte(0x33),
        },
    ]
}

fn setup() -> Contract {
    as_caller("owner.sandbox", 0, T0);
    let mut contract = Contract::new(aid("owner.sandbox"));
    contract.register_actor(
        aid("clinic.sandbox"),
        Role::Clinic,
        "Riverbend Family Clinic".into(),
        hex_byte(0xaa),
    );
    contract.register_actor(
        aid("maya.sandbox"),
        Role::Patient,
        "Patient".into(),
        hex_byte(0xbb),
    );
    contract.register_actor(
        aid("hospital.sandbox"),
        Role::Clinic,
        "St. Aster General".into(),
        hex_byte(0xcc),
    );
    contract.register_actor(
        aid("pulse.sandbox"),
        Role::App,
        "PulseFit".into(),
        hex_byte(0xee),
    );
    contract
}

fn record_and_request(contract: &mut Contract) -> (u64, u64) {
    as_caller("clinic.sandbox", 0, T0);
    let record_id = contract
        .create_record(aid("maya.sandbox"), sections())
        .0;
    let share_id = contract
        .request_referral(
            U64(record_id),
            aid("hospital.sandbox"),
            vec!["history".into(), "notes".into()],
            hex_byte(0x44),
        )
        .0;
    (record_id, share_id)
}

#[test]
#[should_panic(expected = "ERR_NOT_REGISTERED")]
fn unregistered_cannot_create_record() {
    let mut contract = setup();
    as_caller("stranger.sandbox", 0, T0);
    contract.create_record(aid("maya.sandbox"), sections());
}

#[test]
#[should_panic(expected = "ERR_BAD_ROLE")]
fn patient_cannot_create_record() {
    let mut contract = setup();
    as_caller("maya.sandbox", 0, T0);
    contract.create_record(aid("maya.sandbox"), sections());
}

#[test]
#[should_panic(expected = "ERR_NOT_OWNER")]
fn stranger_cannot_register_actor() {
    let mut contract = setup();
    as_caller("stranger.sandbox", 0, T0);
    contract.register_actor(
        aid("stranger.sandbox"),
        Role::Clinic,
        "Stranger Clinic".into(),
        hex_byte(0x01),
    );
}

#[test]
#[should_panic(expected = "ERR_UNAUTHORIZED")]
fn other_clinic_cannot_request_referral_for_a_record_it_did_not_create() {
    let mut contract = setup();
    let (record_id, _) = record_and_request(&mut contract);
    as_caller("hospital.sandbox", 0, T0 + 1);
    contract.request_referral(
        U64(record_id),
        aid("hospital.sandbox"),
        vec!["history".into()],
        hex_byte(0x45),
    );
}

#[test]
#[should_panic(expected = "ERR_BAD_HASH")]
fn purpose_text_is_rejected_on_chain() {
    let mut contract = setup();
    as_caller("clinic.sandbox", 0, T0);
    let record_id = contract
        .create_record(aid("maya.sandbox"), sections())
        .0;
    contract.request_referral(
        U64(record_id),
        aid("hospital.sandbox"),
        vec!["history".into()],
        "Fictional patient name".into(),
    );
}

#[test]
#[should_panic(expected = "ERR_BAD_STATUS")]
fn hospital_cannot_open_before_patient_approval() {
    let mut contract = setup();
    let (_, share_id) = record_and_request(&mut contract);
    as_caller("hospital.sandbox", 0, T0 + 1);
    contract.request_open(U64(share_id), hex_byte(0x51));
}

#[test]
#[should_panic(expected = "ERR_UNAUTHORIZED")]
fn stranger_cannot_open_an_active_share() {
    let mut contract = setup();
    let (_, share_id) = record_and_request(&mut contract);
    as_caller("maya.sandbox", 1, T0 + 2);
    contract.approve_share(
        U64(share_id),
        vec!["history".into()],
        U64(T0 + 7 * DAY),
        true,
        hex_byte(0x61),
        hex_byte(0x62),
    );
    as_caller("stranger.sandbox", 0, T0 + 3);
    contract.request_open(U64(share_id), hex_byte(0x52));
}

#[test]
#[should_panic(expected = "ERR_UNAUTHORIZED")]
fn clinic_cannot_approve_even_with_one_yocto() {
    let mut contract = setup();
    let (_, share_id) = record_and_request(&mut contract);
    as_caller("clinic.sandbox", 1, T0 + 2);
    contract.approve_share(
        U64(share_id),
        vec!["history".into()],
        U64(T0 + DAY),
        true,
        hex_byte(0x61),
        hex_byte(0x62),
    );
}

#[test]
#[should_panic(expected = "ERR_UNAUTHORIZED")]
fn forged_signer_does_not_count_as_the_patient() {
    // The signer account is the patient. The predecessor is the hospital.
    // Only the predecessor may approve.
    let mut contract = setup();
    let (_, share_id) = record_and_request(&mut contract);
    set_env("hospital.sandbox", "maya.sandbox", 1, T0 + 2);
    contract.approve_share(
        U64(share_id),
        vec!["history".into()],
        U64(T0 + DAY),
        true,
        hex_byte(0x61),
        hex_byte(0x62),
    );
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn approve_with_zero_deposit_fails() {
    let mut contract = setup();
    let (_, share_id) = record_and_request(&mut contract);
    as_caller("maya.sandbox", 0, T0 + 2);
    contract.approve_share(
        U64(share_id),
        vec!["history".into()],
        U64(T0 + DAY),
        true,
        hex_byte(0x61),
        hex_byte(0x62),
    );
}

#[test]
#[should_panic(expected = "ERR_REVOKED")]
fn open_after_revoke_fails() {
    let mut contract = setup();
    let (_, share_id) = record_and_request(&mut contract);
    as_caller("maya.sandbox", 1, T0 + 2);
    contract.approve_share(
        U64(share_id),
        vec!["history".into()],
        U64(T0 + 7 * DAY),
        true,
        hex_byte(0x61),
        hex_byte(0x62),
    );
    as_caller("maya.sandbox", 1, T0 + 3);
    contract.revoke_share(U64(share_id));
    as_caller("hospital.sandbox", 0, T0 + 4);
    contract.request_open(U64(share_id), hex_byte(0x53));
}

#[test]
fn revoked_ticket_does_not_stay_valid_inside_the_window() {
    let mut contract = setup();
    let (_, share_id) = record_and_request(&mut contract);
    as_caller("maya.sandbox", 1, T0 + 2);
    contract.approve_share(
        U64(share_id),
        vec!["history".into()],
        U64(T0 + 7 * DAY),
        true,
        hex_byte(0x61),
        hex_byte(0x62),
    );
    as_caller("hospital.sandbox", 0, T0 + 3);
    let nonce = hex_byte(0x54);
    contract.request_open(U64(share_id), nonce.clone());
    as_caller("hospital.sandbox", 0, T0 + 4);
    assert!(contract.check_ticket(
        U64(share_id),
        aid("hospital.sandbox"),
        nonce.clone()
    ));
    // Same nonce still passes before revoke. The contract does not consume it.
    assert!(contract.check_ticket(
        U64(share_id),
        aid("hospital.sandbox"),
        nonce.clone()
    ));
    as_caller("maya.sandbox", 1, T0 + 5);
    contract.revoke_share(U64(share_id));
    as_caller("hospital.sandbox", 0, T0 + 6);
    assert!(!contract.check_ticket(
        U64(share_id),
        aid("hospital.sandbox"),
        nonce
    ));
    let view = contract.get_share(U64(share_id)).unwrap();
    assert_eq!(view.status, ShareStatus::Revoked);
    assert_eq!(view.effective_status, EffectiveStatus::Revoked);
}

#[test]
fn ticket_expires_after_120_seconds() {
    let mut contract = setup();
    let (_, share_id) = record_and_request(&mut contract);
    as_caller("maya.sandbox", 1, T0 + 2);
    contract.approve_share(
        U64(share_id),
        vec!["notes".into()],
        U64(T0 + 7 * DAY),
        true,
        hex_byte(0x61),
        hex_byte(0x62),
    );
    as_caller("hospital.sandbox", 0, T0 + 10);
    let nonce = hex_byte(0x55);
    contract.request_open(U64(share_id), nonce.clone());
    as_caller("hospital.sandbox", 0, T0 + 10 + 120 * SEC);
    assert!(contract.check_ticket(U64(share_id), aid("hospital.sandbox"), nonce.clone()));
    as_caller("hospital.sandbox", 0, T0 + 10 + 120 * SEC + 1);
    assert!(!contract.check_ticket(U64(share_id), aid("hospital.sandbox"), nonce));
}

#[test]
fn wrong_account_cannot_use_another_accounts_ticket() {
    let mut contract = setup();
    let (_, share_id) = record_and_request(&mut contract);
    as_caller("maya.sandbox", 1, T0 + 2);
    contract.approve_share(
        U64(share_id),
        vec!["history".into()],
        U64(T0 + DAY),
        true,
        hex_byte(0x61),
        hex_byte(0x62),
    );
    as_caller("hospital.sandbox", 0, T0 + 3);
    let nonce = hex_byte(0x56);
    contract.request_open(U64(share_id), nonce.clone());
    assert!(!contract.check_ticket(U64(share_id), aid("clinic.sandbox"), nonce));
}

#[test]
fn read_only_share_still_accepts_a_reply() {
    let mut contract = setup();
    let (_, share_id) = record_and_request(&mut contract);
    as_caller("maya.sandbox", 1, T0 + 2);
    contract.approve_share(
        U64(share_id),
        vec!["history".into()],
        U64(T0 + DAY),
        true,
        hex_byte(0x61),
        hex_byte(0x62),
    );
    let approved = contract.get_share(U64(share_id)).unwrap();
    assert!(approved.read_only);
    as_caller("hospital.sandbox", 0, T0 + 3);
    let reply = contract.submit_reply(U64(share_id), hex_byte(0x91)).0;
    let view = contract.get_share(U64(reply)).unwrap();
    assert_eq!(view.kind, ShareKind::Reply);
    assert_eq!(view.to, aid("maya.sandbox"));
    assert_eq!(view.effective_status, EffectiveStatus::Active);
}

#[test]
fn empty_grant_still_activates_the_share() {
    let mut contract = setup();
    let (_, share_id) = record_and_request(&mut contract);
    as_caller("maya.sandbox", 1, T0 + 2);
    contract.approve_share(
        U64(share_id),
        vec![],
        U64(T0 + DAY),
        true,
        hex_byte(0x61),
        hex_byte(0x62),
    );
    let view = contract.get_share(U64(share_id)).unwrap();
    assert!(view.granted_sections.is_empty());
    assert_eq!(view.effective_status, EffectiveStatus::Active);
    as_caller("hospital.sandbox", 0, T0 + 3);
    contract.request_open(U64(share_id), hex_byte(0x57));
    assert_eq!(contract.get_share(U64(share_id)).unwrap().open_count, 1);
}

#[test]
#[should_panic(expected = "ERR_NO_RECEIPT")]
fn deid_share_without_a_receipt_is_rejected() {
    let mut contract = setup();
    as_caller("clinic.sandbox", 0, T0);
    let record_id = contract
        .create_record(aid("maya.sandbox"), sections())
        .0;
    as_caller("maya.sandbox", 1, T0 + 1);
    let share_id = contract
        .create_share(
            U64(record_id),
            aid("pulse.sandbox"),
            ShareKind::DeidApp,
            vec![],
            Some(U64(T0 + 30 * DAY)),
            true,
            hex_byte(0x71),
            hex_byte(0x72),
            None,
            None,
        )
        .0;
    let _ = share_id;
}

#[test]
#[should_panic(expected = "ERR_BAD_NAME")]
fn owner_can_store_a_patient_style_display_name() {
    let mut contract = setup();
    as_caller("owner.sandbox", 0, T0 + 1);
    contract.register_actor(
        aid("maya.sandbox"),
        Role::Patient,
        "Quinlan Voss".into(),
        hex_byte(0xbb),
    );
}

#[test]
#[should_panic(expected = "ERR_BAD_SECTION")]
fn unknown_section_key_is_rejected() {
    let mut contract = setup();
    as_caller("clinic.sandbox", 0, T0);
    contract.create_record(
        aid("maya.sandbox"),
        vec![SectionMeta {
            key: "history\u{200b}".into(),
            cipher_hash: hex_byte(0x11),
        }],
    );
}

#[test]
fn registered_clinic_can_create_many_records() {
    let mut contract = setup();
    as_caller("clinic.sandbox", 0, T0);
    for _ in 0..30 {
        contract.create_record(aid("maya.sandbox"), sections());
    }
    assert!(contract.get_record(U64(30)).is_some());
}

#[test]
#[should_panic(expected = "ERR_UNAUTHORIZED")]
fn hospital_cannot_open_the_raw_record_it_did_not_create() {
    let mut contract = setup();
    let (record_id, _) = record_and_request(&mut contract);
    as_caller("hospital.sandbox", 0, T0 + 1);
    contract.request_owner_open(U64(record_id), hex_byte(0x58));
}

#[test]
fn creating_clinic_can_log_a_raw_open_without_a_patient_transaction() {
    let mut contract = setup();
    let (record_id, _) = record_and_request(&mut contract);
    as_caller("clinic.sandbox", 0, T0 + 1);
    contract.request_owner_open(U64(record_id), hex_byte(0x59));
    assert!(contract.check_record_ticket(
        U64(record_id),
        aid("clinic.sandbox"),
        hex_byte(0x59)
    ));
}
