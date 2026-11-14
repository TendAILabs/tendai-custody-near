//! Fresh bypass checks for the retest. Mock runtime only. No network and no mainnet.
//! These do not replace docs/redteam/repros/contract-mock/tests/attacks.rs.

use near_sdk::json_types::U64;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{AccountId, NearToken, testing_env};
use referral_relay::{Contract, EffectiveStatus, Role, SectionMeta, ShareKind};

const T0: u64 = 1_700_000_000_000_000_000;
const DAY: u64 = 24 * 60 * 60 * 1_000_000_000;

fn aid(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn hex_byte(byte: u8) -> String {
    format!("{byte:02x}").repeat(32)
}

fn as_caller(caller: &str, yocto: u128, timestamp: u64) {
    let id = aid(caller);
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(aid("relay.sandbox"))
        .signer_account_id(id.clone())
        .predecessor_account_id(id)
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .block_timestamp(timestamp);
    testing_env!(builder.build());
}

fn sections() -> Vec<SectionMeta> {
    vec![SectionMeta {
        key: "history".into(),
        cipher_hash: hex_byte(0x11),
    }]
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
        aid("pulse.sandbox"),
        Role::App,
        "PulseFit".into(),
        hex_byte(0xee),
    );
    contract
}

fn register(contract: &mut Contract, account: &str, role: Role, name: &str) {
    as_caller("owner.sandbox", 0, T0 + 1);
    contract.register_actor(aid(account), role, name.into(), hex_byte(0xbc));
}

#[test]
#[should_panic(expected = "ERR_BAD_NAME")]
fn two_word_personal_name_is_still_rejected() {
    let mut contract = setup();
    register(&mut contract, "extra.sandbox", Role::Patient, "Quinlan Voss");
}

#[test]
#[should_panic(expected = "ERR_BAD_NAME")]
fn single_token_personal_name_is_stored() {
    let mut contract = setup();
    register(&mut contract, "extra.sandbox", Role::Patient, "Okafor");
}

#[test]
#[should_panic(expected = "ERR_BAD_NAME")]
fn org_word_lets_a_personal_name_through() {
    let mut contract = setup();
    let name = "North Clinic Maya Okafor";
    register(&mut contract, "extra.sandbox", Role::Clinic, name);
}

#[test]
fn deid_app_accepts_any_64_hex_receipt() {
    let mut contract = setup();
    as_caller("clinic.sandbox", 0, T0);
    let record_id = contract.create_record(aid("maya.sandbox"), sections()).0;
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
            Some(hex_byte(0x11)),
            None,
        )
        .0;
    let view = contract.get_share(U64(share_id)).unwrap();
    assert_eq!(view.kind, ShareKind::DeidApp);
    assert_eq!(view.effective_status, EffectiveStatus::Active);
    assert_eq!(view.tee_receipt_hash.as_deref(), Some(hex_byte(0x11).as_str()));
}
