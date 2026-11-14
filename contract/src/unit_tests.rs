use super::*;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{NearToken, testing_env};

const T0: u64 = 1_700_000_000_000_000_000;
const DAY_NS: u64 = 24 * 60 * 60 * 1_000_000_000;

fn aid(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn hex_byte(byte: u8) -> String {
    format!("{byte:02x}").repeat(32)
}

fn rid(byte: u8) -> String {
    hex_byte(byte)
}

fn set_env(caller: &str, yocto: u128, timestamp: u64) {
    let caller = aid(caller);
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(aid("relay.sandbox"))
        .signer_account_id(caller.clone())
        .predecessor_account_id(caller)
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .block_timestamp(timestamp);
    testing_env!(builder.build());
}

fn init_contract() -> Contract {
    set_env("relay.sandbox", 0, T0);
    Contract::new(aid("owner.sandbox"))
}

fn setup() -> Contract {
    let mut contract = init_contract();
    let deposit = NearToken::from_near(1).as_yoctonear();
    set_env("owner.sandbox", deposit, T0);
    let rows = [
        ("clinic.sandbox", Role::Clinic, "Riverbend Family Clinic", 0xaa_u8),
        ("maya.sandbox", Role::Patient, "Patient", 0xbb),
        ("hospital.sandbox", Role::Clinic, "St. Aster General", 0xcc),
        ("second.sandbox", Role::Clinic, "Northgate Heart Institute", 0xdd),
        ("pulse.sandbox", Role::App, "PulseFit", 0xee),
        ("lakeside.sandbox", Role::Clinic, "Lakeside Family Medicine", 0xab),
    ];
    for (account, role, name, key) in rows {
        set_env("owner.sandbox", deposit, T0);
        contract.register_actor(aid(account), role, name.into(), hex_byte(key));
    }
    contract
}

fn sections() -> Vec<SectionMeta> {
    vec![
        SectionMeta {
            key: "history".into(),
            cipher_hash: hex_byte(0x11),
        },
        SectionMeta {
            key: "meds".into(),
            cipher_hash: hex_byte(0x22),
        },
        SectionMeta {
            key: "notes".into(),
            cipher_hash: hex_byte(0x33),
        },
    ]
}

fn create_maya_record(contract: &mut Contract) -> u64 {
    set_env("clinic.sandbox", 0, T0);
    contract
        .create_record(rid(0x01), aid("maya.sandbox"), sections())
        .0
}

fn request(contract: &mut Contract, record_id: u64) -> u64 {
    set_env("clinic.sandbox", 0, T0);
    contract
        .request_referral(
            rid(0x02),
            U64(record_id),
            U64(1),
            aid("hospital.sandbox"),
            vec!["history".into(), "meds".into(), "notes".into()],
            hex_byte(0x44),
        )
        .0
}

fn approve(contract: &mut Contract, share_id: u64, expires: u64) {
    set_env("maya.sandbox", 1, T0);
    contract.approve_share(
        U64(share_id),
        vec!["history".into(), "meds".into()],
        U64(expires),
        true,
        hex_byte(0x55),
        hex_byte(0x66),
    );
}

#[test]
fn register_create_and_referral_events() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let logs = get_logs().join("\n");
    assert!(logs.contains("\"standard\":\"referral_relay\""));
    assert!(logs.contains("\"version\":\"2.0.0\""));
    assert!(!logs.contains("\"version\":\"1.0.0\""));
    assert!(logs.contains("\"event\":\"record_created\""));
    let share_id = request(&mut contract, record_id);
    let share = contract.get_share(U64(share_id)).unwrap();
    assert_eq!(share.effective_status, EffectiveStatus::Requested);
    assert_eq!(share.kind, ShareKind::Referral);
    assert_eq!(share.grant_epoch, U64(1));
    let pending = contract.list_pending_for_patient(aid("maya.sandbox"), 0, 10);
    assert_eq!(pending.len(), 1);
    assert!(
        get_logs()
            .iter()
            .any(|line| line.contains("\"event\":\"referral_requested\""))
    );
}

#[test]
#[should_panic(expected = "ERR_NOT_REGISTERED")]
fn unregistered_account_cannot_create_record() {
    let mut contract = setup();
    set_env("stranger.sandbox", 0, T0);
    contract.create_record(rid(0x03), aid("maya.sandbox"), sections());
}

#[test]
#[should_panic(expected = "ERR_BAD_ROLE")]
fn patient_cannot_create_record() {
    let mut contract = setup();
    set_env("maya.sandbox", 0, T0);
    contract.create_record(rid(0x03), aid("maya.sandbox"), sections());
}

#[test]
#[should_panic(expected = "ERR_NOT_OWNER")]
fn stranger_cannot_propose_owner() {
    let mut contract = init_contract();
    set_env("stranger.sandbox", 1, T0 + 1);
    contract.propose_owner(aid("next.sandbox"), U64(T0 + DAY_NS));
}

#[test]
#[should_panic(expected = "ERR_NOT_OWNER")]
fn non_owner_cannot_register() {
    let mut contract = setup();
    set_env("clinic.sandbox", NearToken::from_near(1).as_yoctonear(), T0);
    contract.register_actor(
        aid("other.sandbox"),
        Role::Clinic,
        "Other Clinic".into(),
        hex_byte(0x01),
    );
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn approve_without_one_yocto_fails() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    set_env("maya.sandbox", 0, T0);
    contract.approve_share(
        U64(share_id),
        vec!["history".into()],
        U64(T0 + DAY_NS),
        true,
        hex_byte(0x55),
        hex_byte(0x66),
    );
}

#[test]
fn approve_narrows_scope_and_sets_active() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    approve(&mut contract, share_id, T0 + 30 * DAY_NS);
    let share = contract.get_share(U64(share_id)).unwrap();
    assert_eq!(share.status, ShareStatus::Active);
    assert_eq!(share.effective_status, EffectiveStatus::Active);
    let raw = near_sdk::serde_json::to_string(&share).unwrap();
    assert!(raw.contains("\"effective_status\":\"Active\""), "{raw}");
    assert!(raw.contains("\"status\":\"Active\""), "{raw}");
    assert_eq!(
        share.granted_sections,
        vec!["history".to_string(), "meds".to_string()]
    );
    assert!(share.consented_at_ns.is_some());
    let logs = get_logs().join("\n");
    assert!(logs.contains("\"event\":\"share_consented\""));
    assert!(logs.contains("\"event\":\"share_transformed\""));
    assert!(logs.contains("\"version\":\"2.0.0\""));
    assert!(
        !contract
            .staff_method_names()
            .iter()
            .any(|method| method == "approve_share")
    );
    assert!(contract.list_pending_for_patient(aid("maya.sandbox"), 0, 10).is_empty());
}

#[test]
#[should_panic(expected = "ERR_BAD_SECTION")]
fn approve_cannot_add_a_section() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    set_env("clinic.sandbox", 0, T0);
    let share_id = contract
        .request_referral(
            rid(0x21),
            U64(record_id),
            U64(1),
            aid("hospital.sandbox"),
            vec!["history".into()],
            hex_byte(0x44),
        )
        .0;
    set_env("maya.sandbox", 1, T0);
    contract.approve_share(
        U64(share_id),
        vec!["history".into(), "notes".into()],
        U64(T0 + DAY_NS),
        true,
        hex_byte(0x55),
        hex_byte(0x66),
    );
}

#[test]
#[should_panic(expected = "ERR_BAD_EXPIRY")]
fn approve_rejects_expiry_past_365_days() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    approve(&mut contract, share_id, T0 + 366 * DAY_NS);
}

#[test]
fn open_by_recipient_and_check_ticket_window() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    approve(&mut contract, share_id, T0 + 30 * DAY_NS);
    set_env("hospital.sandbox", 0, T0 + 5);
    contract.request_open(U64(share_id), hex_byte(0x77));
    assert!(contract.check_ticket(U64(share_id), aid("hospital.sandbox"), hex_byte(0x77)));
    assert!(!contract.check_ticket(U64(share_id), aid("hospital.sandbox"), hex_byte(0x78)));
    set_env("hospital.sandbox", 0, T0 + 5 + TICKET_TTL_NS);
    assert!(contract.check_ticket(U64(share_id), aid("hospital.sandbox"), hex_byte(0x77)));
    set_env("hospital.sandbox", 0, T0 + 5 + TICKET_TTL_NS + 1);
    assert!(!contract.check_ticket(U64(share_id), aid("hospital.sandbox"), hex_byte(0x77)));
    let share = contract.get_share(U64(share_id)).unwrap();
    assert_eq!(share.open_count, 1);
}

#[test]
#[should_panic(expected = "ERR_UNAUTHORIZED")]
fn unauthorized_open_is_rejected() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    approve(&mut contract, share_id, T0 + DAY_NS);
    set_env("second.sandbox", 0, T0 + 10);
    contract.request_open(U64(share_id), hex_byte(0x77));
}

#[test]
#[should_panic(expected = "ERR_REVOKED")]
fn revoke_then_open_fails() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    approve(&mut contract, share_id, T0 + DAY_NS);
    set_env("maya.sandbox", 1, T0 + 20);
    contract.revoke_share(U64(share_id));
    assert!(!contract.check_ticket(U64(share_id), aid("hospital.sandbox"), hex_byte(0x77)));
    set_env("hospital.sandbox", 0, T0 + 21);
    contract.request_open(U64(share_id), hex_byte(0x77));
}

#[test]
#[should_panic(expected = "ERR_EXPIRED")]
fn lazy_expiry_blocks_open() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    approve(&mut contract, share_id, T0 + 1_000);
    set_env("hospital.sandbox", 0, T0 + 1_000);
    assert_eq!(
        contract.get_share(U64(share_id)).unwrap().effective_status,
        EffectiveStatus::Active
    );
    set_env("hospital.sandbox", 0, T0 + 1_001);
    assert_eq!(
        contract.get_share(U64(share_id)).unwrap().effective_status,
        EffectiveStatus::Expired
    );
    assert!(!contract.check_ticket(U64(share_id), aid("hospital.sandbox"), hex_byte(0x77)));
    contract.request_open(U64(share_id), hex_byte(0x77));
}

#[test]
fn owner_can_open_share_and_raw_record() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    approve(&mut contract, share_id, T0 + DAY_NS);
    set_env("maya.sandbox", 0, T0 + 30);
    contract.request_open(U64(share_id), hex_byte(0x79));
    assert!(contract.check_ticket(U64(share_id), aid("maya.sandbox"), hex_byte(0x79)));
    set_env("clinic.sandbox", 0, T0 + 31);
    contract.request_owner_open(U64(record_id), hex_byte(0x7a));
    assert!(contract.check_record_ticket(U64(record_id), aid("clinic.sandbox"), hex_byte(0x7a)));
    assert!(!contract.check_record_ticket(U64(record_id), aid("hospital.sandbox"), hex_byte(0x7a)));
}

#[test]
#[should_panic(expected = "ERR_UNAUTHORIZED")]
fn stranger_cannot_open_raw_record() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    set_env("hospital.sandbox", 0, T0);
    contract.request_owner_open(U64(record_id), hex_byte(0x7a));
}

#[test]
fn decline_and_rotate_key() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    set_env("maya.sandbox", 1, T0 + 2);
    contract.decline_share(U64(share_id));
    assert_eq!(
        contract.get_share(U64(share_id)).unwrap().status,
        ShareStatus::Declined
    );
    set_env("hospital.sandbox", 0, T0 + 3);
    contract.rotate_enc_key(hex_byte(0x99));
    let actor = contract.get_actor(aid("hospital.sandbox")).unwrap();
    assert_eq!(actor.enc_pubkey, hex_byte(0x99));
    assert_eq!(actor.role, Role::Clinic);
    assert_eq!(actor.key_version, U64(2));
}

#[test]
fn patient_shares_second_opinion_transfer_and_deid_app() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let referral = request(&mut contract, record_id);
    approve(&mut contract, referral, T0 + 30 * DAY_NS);

    set_env("maya.sandbox", 1, T0 + 40);
    let second = contract
        .create_share(
            rid(0x31),
            U64(record_id),
            U64(1),
            aid("second.sandbox"),
            ShareKind::SecondOpinion,
            vec!["history".into()],
            Some(U64(T0 + 7 * DAY_NS)),
            true,
            hex_byte(0x81),
            hex_byte(0x82),
            Some(hex_byte(0x83)),
            Some(U64(referral)),
        )
        .0;
    assert_eq!(
        contract.get_share(U64(second)).unwrap().kind,
        ShareKind::SecondOpinion
    );
    assert_eq!(
        contract.get_share(U64(second)).unwrap().effective_status,
        EffectiveStatus::Active
    );

    set_env("maya.sandbox", 1, T0 + 41);
    let transfer = contract
        .create_share(
            rid(0x32),
            U64(record_id),
            U64(1),
            aid("lakeside.sandbox"),
            ShareKind::Transfer,
            vec!["history".into(), "meds".into(), "notes".into()],
            None,
            false,
            hex_byte(0x84),
            hex_byte(0x85),
            None,
            None,
        )
        .0;
    assert!(
        contract
            .get_share(U64(transfer))
            .unwrap()
            .expires_at_ns
            .is_none()
    );

    set_env("maya.sandbox", 1, T0 + 42);
    let deid = contract
        .create_share(
            rid(0x33),
            U64(record_id),
            U64(1),
            aid("pulse.sandbox"),
            ShareKind::DeidApp,
            vec![],
            Some(U64(T0 + 90 * DAY_NS)),
            true,
            hex_byte(0x86),
            hex_byte(0x87),
            Some(hex_byte(0x89)),
            None,
        )
        .0;
    let deid_view = contract.get_share(U64(deid)).unwrap();
    assert_eq!(deid_view.kind, ShareKind::DeidApp);
    assert_eq!(deid_view.to, aid("pulse.sandbox"));
    assert!(deid_view.granted_sections.is_empty());

    set_env("maya.sandbox", 1, T0 + 43);
    contract.revoke_share(U64(second));
    contract.revoke_share(U64(deid));
    assert_eq!(
        contract.get_share(U64(second)).unwrap().effective_status,
        EffectiveStatus::Revoked
    );
    assert_eq!(
        contract.get_share(U64(deid)).unwrap().effective_status,
        EffectiveStatus::Revoked
    );
    assert_eq!(
        contract.get_share(U64(referral)).unwrap().effective_status,
        EffectiveStatus::Active,
        "single-share revoke does not revoke the parent"
    );
    assert!(!contract.check_ticket(U64(second), aid("second.sandbox"), hex_byte(0x90)));
}

#[test]
#[should_panic(expected = "ERR_UNAUTHORIZED")]
fn recipient_cannot_create_share() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    approve(&mut contract, share_id, T0 + DAY_NS);
    set_env("hospital.sandbox", 1, T0 + 50);
    contract.create_share(
        rid(0x34),
        U64(record_id),
        U64(1),
        aid("second.sandbox"),
        ShareKind::SecondOpinion,
        vec!["history".into()],
        Some(U64(T0 + 7 * DAY_NS)),
        true,
        hex_byte(0x81),
        hex_byte(0x82),
        None,
        Some(U64(share_id)),
    );
}

#[test]
#[should_panic(expected = "ERR_NO_RECEIPT")]
fn deid_app_requires_a_receipt() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    set_env("maya.sandbox", 1, T0 + 10);
    contract.create_share(
        rid(0x35),
        U64(record_id),
        U64(1),
        aid("pulse.sandbox"),
        ShareKind::DeidApp,
        vec![],
        Some(U64(T0 + DAY_NS)),
        true,
        hex_byte(0x86),
        hex_byte(0x87),
        None,
        None,
    );
}

#[test]
#[should_panic(expected = "ERR_BAD_NAME")]
fn personal_display_name_is_rejected() {
    let mut contract = setup();
    set_env("owner.sandbox", 0, T0 + 1);
    contract.register_actor(
        aid("extra.sandbox"),
        Role::Patient,
        "Quinlan Voss".into(),
        hex_byte(0xbc),
    );
}

#[test]
#[should_panic(expected = "ERR_BAD_ROLE")]
fn deid_app_rejects_a_clinic_recipient() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    set_env("maya.sandbox", 1, T0 + 10);
    contract.create_share(
        rid(0x36),
        U64(record_id),
        U64(1),
        aid("hospital.sandbox"),
        ShareKind::DeidApp,
        vec!["notes".into()],
        Some(U64(T0 + DAY_NS)),
        true,
        hex_byte(0x86),
        hex_byte(0x87),
        None,
        None,
    );
}

#[test]
#[should_panic(expected = "ERR_BAD_ROLE")]
fn second_opinion_rejects_an_app_recipient() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    set_env("maya.sandbox", 1, T0 + 10);
    contract.create_share(
        rid(0x37),
        U64(record_id),
        U64(1),
        aid("pulse.sandbox"),
        ShareKind::SecondOpinion,
        vec!["history".into()],
        Some(U64(T0 + DAY_NS)),
        true,
        hex_byte(0x81),
        hex_byte(0x82),
        None,
        None,
    );
}

#[test]
fn revoke_all_epoch_covers_requested_children_and_replies() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let first = request(&mut contract, record_id);
    approve(&mut contract, first, T0 + DAY_NS);
    set_env("hospital.sandbox", 0, T0 + 4);
    let reply = contract
        .submit_reply(rid(0x41), U64(first), U64(1), hex_byte(0x91))
        .0;
    set_env("maya.sandbox", 1, T0 + 5);
    let child = contract
        .create_share(
            rid(0x42),
            U64(record_id),
            U64(1),
            aid("second.sandbox"),
            ShareKind::SecondOpinion,
            vec!["history".into()],
            Some(U64(T0 + 7 * DAY_NS)),
            true,
            hex_byte(0x81),
            hex_byte(0x82),
            None,
            Some(U64(first)),
        )
        .0;
    set_env("clinic.sandbox", 0, T0 + 6);
    let pending = contract
        .request_referral(
            rid(0x43),
            U64(record_id),
            U64(1),
            aid("second.sandbox"),
            vec!["history".into()],
            hex_byte(0x45),
        )
        .0;
    set_env("maya.sandbox", 1, T0 + 7);
    let epoch = contract.revoke_all_for_record(U64(record_id), U64(1)).0;
    assert_eq!(epoch, 2);
    for id in [first, reply, child, pending] {
        assert_eq!(
            contract.get_share(U64(id)).unwrap().effective_status,
            EffectiveStatus::Revoked,
            "share {id}"
        );
    }
    assert_eq!(
        contract.get_share(U64(pending)).unwrap().status,
        ShareStatus::Requested,
        "epoch revoke does not rewrite each share"
    );
    let logs = get_logs();
    let revoke_logs: Vec<_> = logs
        .iter()
        .filter(|line| line.contains("\"event\":\"record_grants_revoked\""))
        .collect();
    assert_eq!(revoke_logs.len(), 1);
    assert!(revoke_logs[0].len() < 2048, "{}", revoke_logs[0].len());
    set_env("maya.sandbox", 1, T0 + 8);
    let again = contract.revoke_all_for_record(U64(record_id), U64(1)).0;
    assert_eq!(again, 2);
    assert_eq!(
        get_logs()
            .iter()
            .filter(|line| line.contains("record_grants_revoked"))
            .count(),
        0
    );
    set_env("clinic.sandbox", 0, T0 + 9);
    let fresh = contract
        .request_referral(
            rid(0x44),
            U64(record_id),
            U64(2),
            aid("hospital.sandbox"),
            vec!["notes".into()],
            hex_byte(0x46),
        )
        .0;
    assert_eq!(
        contract.get_share(U64(fresh)).unwrap().effective_status,
        EffectiveStatus::Requested
    );
}

#[test]
#[should_panic(expected = "ERR_BAD_EPOCH")]
fn revoke_all_rejects_epoch_zero() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    set_env("maya.sandbox", 1, T0 + 1);
    contract.revoke_all_for_record(U64(record_id), U64(0));
}

#[test]
fn submit_reply_creates_a_share_back_to_the_patient() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    approve(&mut contract, share_id, T0 + DAY_NS);
    set_env("hospital.sandbox", 0, T0 + 8);
    let reply = contract
        .submit_reply(rid(0x51), U64(share_id), U64(1), hex_byte(0x91))
        .0;
    let view = contract.get_share(U64(reply)).unwrap();
    assert_eq!(view.kind, ShareKind::Reply);
    assert_eq!(view.to, aid("maya.sandbox"));
    assert_eq!(view.parent, Some(U64(share_id)));
    assert_eq!(view.effective_status, EffectiveStatus::Active);
    assert!(
        get_logs()
            .iter()
            .any(|line| line.contains("\"event\":\"reply_submitted\""))
    );
}

#[test]
#[should_panic(expected = "ERR_BAD_HASH")]
fn short_hash_is_rejected() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    set_env("clinic.sandbox", 0, T0);
    contract.request_referral(
        rid(0x52),
        U64(record_id),
        U64(1),
        aid("hospital.sandbox"),
        vec!["history".into()],
        "abcd".into(),
    );
}

#[test]
fn fresh_state_is_schema_v2_without_a_migration_path() {
    let contract = init_contract();
    assert_eq!(contract.schema_version, 2);
    assert_eq!(contract.owner.to_account(), aid("owner.sandbox"));
    assert_eq!(contract.next_record_id, 1);
    assert_eq!(contract.next_share_id, 1);
    assert_eq!(contract.actor_count, 0);
    let bytes = near_sdk::borsh::to_vec(&contract).expect("borsh");
    let restored: Contract = near_sdk::borsh::from_slice(&bytes).expect("borsh");
    assert_eq!(restored.schema_version, 2);
    assert_eq!(restored.owner.to_account(), aid("owner.sandbox"));
    assert_ne!(bytes.len(), 106, "schema 1 layout must not match");
}

#[test]
fn self_register_patient_pays_storage_and_emits_actor_registered() {
    let mut contract = init_contract();
    set_env("visitor.sandbox", NearToken::from_near(1).as_yoctonear(), T0);
    contract.self_register_patient(hex_byte(0x42));
    let actor = contract.get_actor(aid("visitor.sandbox")).unwrap();
    assert_eq!(actor.role, Role::Patient);
    assert_eq!(actor.display_name, "Patient");
    assert_eq!(actor.enc_pubkey, hex_byte(0x42));
    assert!(actor.active);
    assert_eq!(actor.key_version, U64(1));
    let logs = get_logs().join("\n");
    assert!(logs.contains("\"event\":\"actor_registered\""));
    assert!(logs.contains("\"version\":\"2.0.0\""));
    assert!(logs.contains("\"role\":\"Patient\""));
    assert!(logs.contains("\"self_registered\":true"));
    assert!(logs.contains("visitor.sandbox"));
    set_env("owner.sandbox", NearToken::from_near(1).as_yoctonear(), T0);
    contract.register_actor(
        aid("clinic.sandbox"),
        Role::Clinic,
        "Riverbend Family Clinic".into(),
        hex_byte(0xaa),
    );
    set_env("clinic.sandbox", 0, T0 + 1);
    let record = contract.create_record(rid(0x61), aid("visitor.sandbox"), sections());
    assert_eq!(record.0, 1);
}

#[test]
#[should_panic(expected = "ERR_ALREADY_REGISTERED")]
fn register_actor_rejects_an_existing_id() {
    let mut contract = init_contract();
    let deposit = NearToken::from_near(1).as_yoctonear();
    set_env("owner.sandbox", deposit, T0);
    contract.register_actor(
        aid("clinic.sandbox"),
        Role::Clinic,
        "Riverbend Family Clinic".into(),
        hex_byte(0xaa),
    );
    set_env("owner.sandbox", deposit, T0);
    contract.register_actor(
        aid("clinic.sandbox"),
        Role::Clinic,
        "Riverbend Family Clinic".into(),
        hex_byte(0xab),
    );
}

#[test]
fn roles_stay_fixed_and_rotation_is_self_only() {
    let mut contract = setup();
    let patient_before = contract.get_actor(aid("maya.sandbox")).unwrap();
    set_env("owner.sandbox", 0, T0 + 1);
    set_env("clinic.sandbox", 0, T0 + 2);
    contract.rotate_enc_key(hex_byte(0x99));
    let patient = contract.get_actor(aid("maya.sandbox")).unwrap();
    assert_eq!(patient.role, Role::Patient);
    assert_eq!(patient.enc_pubkey, patient_before.enc_pubkey);
    assert_eq!(patient.key_version, U64(1));
    let clinic = contract.get_actor(aid("clinic.sandbox")).unwrap();
    assert_eq!(clinic.role, Role::Clinic);
    assert_eq!(clinic.enc_pubkey, hex_byte(0x99));
    assert_eq!(clinic.key_version, U64(2));
    let logs = get_logs().join("\n");
    assert!(logs.contains("\"event\":\"actor_updated\""));
    assert!(logs.contains("\"account\":\"clinic.sandbox\""));
    assert!(logs.contains("\"key_version\":\"2\""));
    let old = hash_bytes(&decode_key(&hex_byte(0xaa)));
    let new = hash_bytes(&decode_key(&hex_byte(0x99)));
    assert!(logs.contains(&encode_hex(&old)));
    assert!(logs.contains(&encode_hex(&new)));
    set_env("clinic.sandbox", 0, T0 + 3);
    contract.rotate_enc_key(hex_byte(0x99));
    assert!(!get_logs().iter().any(|line| line.contains("actor_updated")));
    assert_eq!(
        contract.get_actor(aid("clinic.sandbox")).unwrap().key_version,
        U64(2)
    );
}

#[test]
#[should_panic(expected = "ERR_NOT_REGISTERED")]
fn owner_rotate_does_not_touch_a_patient_key() {
    let contract = setup();
    let _ = contract.get_actor(aid("maya.sandbox")).unwrap();
    set_env("owner.sandbox", 0, T0 + 1);
    let mut contract = contract;
    contract.rotate_enc_key(hex_byte(0x10));
}

#[test]
#[should_panic(expected = "ERR_ALREADY_REGISTERED")]
fn self_register_rejects_a_second_call() {
    let mut contract = init_contract();
    set_env("visitor.sandbox", NearToken::from_near(1).as_yoctonear(), T0);
    contract.self_register_patient(hex_byte(0x42));
    set_env("visitor.sandbox", NearToken::from_near(1).as_yoctonear(), T0);
    contract.self_register_patient(hex_byte(0x43));
}

#[test]
#[should_panic(expected = "ERR_ALREADY_REGISTERED")]
fn self_register_rejects_an_existing_clinic() {
    let mut contract = setup();
    set_env("clinic.sandbox", NearToken::from_near(1).as_yoctonear(), T0);
    contract.self_register_patient(hex_byte(0x42));
}

#[test]
#[should_panic(expected = "ERR_STORAGE")]
fn self_register_rejects_a_deposit_below_storage() {
    let mut contract = init_contract();
    set_env("visitor.sandbox", 1, T0);
    contract.self_register_patient(hex_byte(0x42));
}

#[test]
#[should_panic(expected = "ERR_STORAGE")]
fn register_actor_rejects_a_deposit_below_storage() {
    let mut contract = init_contract();
    set_env("owner.sandbox", 0, T0);
    contract.register_actor(
        aid("clinic.sandbox"),
        Role::Clinic,
        "Riverbend Family Clinic".into(),
        hex_byte(0xaa),
    );
}

#[test]
#[should_panic(expected = "ERR_BAD_KEY")]
fn self_register_rejects_a_bad_pubkey() {
    let mut contract = init_contract();
    set_env("visitor.sandbox", NearToken::from_near(1).as_yoctonear(), T0);
    contract.self_register_patient("not-a-key".into());
}

#[test]
#[should_panic(expected = "ERR_DUPLICATE")]
fn duplicate_sections_are_rejected() {
    let mut contract = setup();
    set_env("clinic.sandbox", 0, T0);
    contract.create_record(
        rid(0x62),
        aid("maya.sandbox"),
        vec![
            SectionMeta {
                key: "history".into(),
                cipher_hash: hex_byte(0x11),
            },
            SectionMeta {
                key: "history".into(),
                cipher_hash: hex_byte(0x12),
            },
        ],
    );
}

#[test]
fn creation_request_id_replays_and_conflicts() {
    let mut contract = setup();
    set_env("clinic.sandbox", 0, T0);
    let first = contract
        .create_record(rid(0x70), aid("maya.sandbox"), sections())
        .0;
    set_env("clinic.sandbox", 0, T0 + 1);
    let again = contract
        .create_record(rid(0x70), aid("maya.sandbox"), sections())
        .0;
    assert_eq!(first, again);
    assert_eq!(contract.next_record_id, 2);
    assert!(!get_logs().iter().any(|line| line.contains("record_created")));
    let share = request(&mut contract, first);
    set_env("clinic.sandbox", 0, T0 + 2);
    let share_again = contract
        .request_referral(
            rid(0x02),
            U64(first),
            U64(1),
            aid("hospital.sandbox"),
            vec!["history".into(), "meds".into(), "notes".into()],
            hex_byte(0x44),
        )
        .0;
    assert_eq!(share, share_again);
    assert_eq!(contract.list_shares_for_record(U64(first), 0, 50).len(), 1);
    let view = contract
        .get_operation(aid("clinic.sandbox"), CreateMethod::CreateRecord, rid(0x70))
        .unwrap();
    assert_eq!(view.result_id, U64(first));
}

#[test]
#[should_panic(expected = "ERR_REQUEST_ID_CONFLICT")]
fn creation_request_id_rejects_different_args() {
    let mut contract = setup();
    set_env("clinic.sandbox", 0, T0);
    contract.create_record(rid(0x71), aid("maya.sandbox"), sections());
    set_env("clinic.sandbox", 0, T0 + 1);
    contract.create_record(
        rid(0x71),
        aid("maya.sandbox"),
        vec![SectionMeta {
            key: "labs".into(),
            cipher_hash: hex_byte(0x12),
        }],
    );
}

#[test]
fn replay_after_revoke_does_not_resurrect() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    approve(&mut contract, share_id, T0 + DAY_NS);
    set_env("maya.sandbox", 1, T0 + 3);
    contract.revoke_share(U64(share_id));
    set_env("clinic.sandbox", 0, T0 + 4);
    let again = contract
        .request_referral(
            rid(0x02),
            U64(record_id),
            U64(1),
            aid("hospital.sandbox"),
            vec!["history".into(), "meds".into(), "notes".into()],
            hex_byte(0x44),
        )
        .0;
    assert_eq!(again, share_id);
    assert_eq!(
        contract.get_share(U64(share_id)).unwrap().effective_status,
        EffectiveStatus::Revoked
    );
}

#[test]
fn same_request_id_is_separated_by_caller_and_method() {
    let mut contract = setup();
    set_env("clinic.sandbox", 0, T0);
    let record_id = contract
        .create_record(rid(0x72), aid("maya.sandbox"), sections())
        .0;
    set_env("clinic.sandbox", 0, T0);
    let share_id = contract
        .request_referral(
            rid(0x72),
            U64(record_id),
            U64(1),
            aid("hospital.sandbox"),
            vec!["history".into()],
            hex_byte(0x44),
        )
        .0;
    let record_op = contract
        .get_operation(aid("clinic.sandbox"), CreateMethod::CreateRecord, rid(0x72))
        .unwrap();
    let share_op = contract
        .get_operation(aid("clinic.sandbox"), CreateMethod::RequestReferral, rid(0x72))
        .unwrap();
    assert_eq!(record_op.result_id, U64(record_id));
    assert_eq!(share_op.result_id, U64(share_id));
    assert_ne!(record_op.method, share_op.method);
    assert!(
        contract
            .get_operation(aid("hospital.sandbox"), CreateMethod::CreateRecord, rid(0x72))
            .is_none()
    );
}

#[test]
fn encryption_context_matches_shared_vectors() {
    set_env("relay.sandbox", 0, T0);
    let contract_id = aid("relay.sandbox");
    let caller = aid("clinic.sandbox");
    let request = decode_hash(&hex_byte(0x11));
    let digest = derive_context(&contract_id, &caller, M_RECORD, &request);
    assert_eq!(
        encode_hex(&digest),
        "2ce8c064a938779d314ebc58b1bf1f3d6a0e425b7318741fcc75adec2ccc7d2e"
    );
    let contract = init_contract();
    let view = contract.encryption_context(
        aid("clinic.sandbox"),
        CreateMethod::CreateRecord,
        hex_byte(0x11),
    );
    assert_eq!(
        view,
        "2ce8c064a938779d314ebc58b1bf1f3d6a0e425b7318741fcc75adec2ccc7d2e"
    );
    set_env("relay.testnet", 0, T0);
    let share = derive_context(
        &aid("relay.testnet"),
        &aid("maya.testnet"),
        M_SHARE,
        &decode_hash(&hex_byte(0x22)),
    );
    assert_eq!(
        encode_hex(&share),
        "f7da5f253316c3301d58363ccf2968f98dbaab9849ea852868478ce9415abd35"
    );
    let reply = derive_context(
        &aid("relay.testnet"),
        &aid("hospital.testnet"),
        M_REPLY,
        &decode_hash(&hex_byte(0x33)),
    );
    assert_eq!(
        encode_hex(&reply),
        "0325ae3c891afdae97fac923cf817517974cef81391e10405f5a162bb4d452d2"
    );
    assert_ne!(encode_hex(&share), encode_hex(&reply));
}

#[test]
fn indexed_pages_read_a_window_and_ignore_other_patients() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    for index in 0..60u8 {
        set_env("clinic.sandbox", 0, T0 + u64::from(index));
        let mut request = [0u8; 32];
        request[0] = index;
        request[1] = 0x91;
        contract.request_referral(
            encode_hex(&request),
            U64(record_id),
            U64(1),
            aid("hospital.sandbox"),
            vec!["history".into()],
            hex_byte(0x44),
        );
    }
    set_env("clinic.sandbox", 0, T0 + 100);
    let other = contract
        .create_record(rid(0x81), aid("maya.sandbox"), sections())
        .0;
    // A second patient with many records must not change Maya's pending page.
    set_env("owner.sandbox", NearToken::from_near(1).as_yoctonear(), T0);
    contract.register_actor(
        aid("nia.sandbox"),
        Role::Patient,
        "Patient".into(),
        hex_byte(0xbd),
    );
    for index in 0..5u8 {
        set_env("clinic.sandbox", 0, T0 + 200 + u64::from(index));
        let mut request = [0u8; 32];
        request[0] = index;
        request[1] = 0x92;
        let id = contract
            .create_record(encode_hex(&request), aid("nia.sandbox"), sections())
            .0;
        let mut referral = [0u8; 32];
        referral[0] = index;
        referral[1] = 0x93;
        contract.request_referral(
            encode_hex(&referral),
            U64(id),
            U64(1),
            aid("hospital.sandbox"),
            vec!["history".into()],
            hex_byte(0x45),
        );
    }
    let first = contract.list_shares_for_record(U64(record_id), 0, 10);
    let far = contract.list_shares_for_record(U64(record_id), 30, 10);
    assert_eq!(first.len(), 10);
    assert_eq!(far.len(), 10);
    assert_eq!(first[0].id, U64(1));
    assert_ne!(first[0].id, far[0].id);
    assert_eq!(
        contract.list_shares_for_record(U64(record_id), 0, 51).len(),
        50
    );
    assert!(contract.list_shares_for_record(U64(record_id), 0, 0).is_empty());
    assert!(contract.list_shares_for_record(U64(record_id), 100, 10).is_empty());
    let pending = contract.list_pending_for_patient(aid("maya.sandbox"), 0, 50);
    assert_eq!(pending.len(), 50);
    let pending_far = contract.list_pending_for_patient(aid("maya.sandbox"), 50, 50);
    assert_eq!(pending_far.len(), 10);
    assert_eq!(
        contract.list_pending_for_patient(aid("nia.sandbox"), 0, 50).len(),
        5
    );
    let _ = other;
}

#[test]
fn opens_and_record_revoke_do_not_grow_storage() {
    let mut contract = setup();
    let record_id = create_maya_record(&mut contract);
    let share_id = request(&mut contract, record_id);
    approve(&mut contract, share_id, T0 + 30 * DAY_NS);
    contract.shares.flush();
    contract.records.flush();
    for batch in 0..50u32 {
        set_env("hospital.sandbox", 0, T0 + 10 + u64::from(batch));
        let before = env::storage_usage();
        for index in 0..20u32 {
            let n = batch * 20 + index;
            let mut nonce = [0u8; 32];
            nonce[0..4].copy_from_slice(&n.to_le_bytes());
            contract.request_open(U64(share_id), encode_hex(&nonce));
        }
        contract.shares.flush();
        assert_eq!(env::storage_usage(), before, "share opens grew storage");
    }
    assert_eq!(contract.get_share(U64(share_id)).unwrap().open_count, 1000);
    set_env("clinic.sandbox", 0, T0 + 80);
    let before_owner = env::storage_usage();
    for index in 0..20u32 {
        let mut nonce = [0u8; 32];
        nonce[4..8].copy_from_slice(&index.to_le_bytes());
        contract.request_owner_open(U64(record_id), encode_hex(&nonce));
    }
    contract.records.flush();
    assert_eq!(env::storage_usage(), before_owner, "owner opens grew storage");
    set_env("clinic.sandbox", 0, T0 + 12);
    for index in 0..30u8 {
        let mut request = [0u8; 32];
        request[0] = index;
        request[2] = 0xa1;
        contract.request_referral(
            encode_hex(&request),
            U64(record_id),
            U64(1),
            aid("second.sandbox"),
            vec!["notes".into()],
            hex_byte(0x47),
        );
    }
    contract.records.flush();
    contract.fenwick.flush();
    contract.shares.flush();
    contract.pending_at.flush();
    set_env("maya.sandbox", 1, T0 + 13);
    let before_revoke = env::storage_usage();
    contract.revoke_all_for_record(U64(record_id), U64(1));
    contract.records.flush();
    contract.fenwick.flush();
    contract.shares.flush();
    assert_eq!(
        env::storage_usage(),
        before_revoke,
        "record revoke grew storage"
    );
    set_env("maya.sandbox", 1, T0 + 14);
    let before_one = env::storage_usage();
    contract.revoke_share(U64(share_id));
    contract.shares.flush();
    contract.pending_at.flush();
    assert!(
        env::storage_usage() <= before_one,
        "single revoke grew storage"
    );
}

#[test]
fn owner_transfer_is_two_step() {
    let mut contract = init_contract();
    set_env("owner.sandbox", 1, T0 + 2);
    let nonce = contract
        .propose_owner(aid("next.sandbox"), U64(T0 + 2 + 6 * DAY_NS))
        .0;
    assert_eq!(contract.get_owner(), aid("owner.sandbox"));
    let proposal = contract.get_owner_proposal().unwrap();
    assert_eq!(proposal.proposed, aid("next.sandbox"));
    assert_eq!(proposal.nonce, U64(nonce));
    set_env("owner.sandbox", 1, T0 + 3);
    contract.cancel_owner(U64(nonce));
    assert!(contract.get_owner_proposal().is_none());
    set_env("owner.sandbox", 1, T0 + 4);
    let nonce = contract
        .propose_owner(aid("next.sandbox"), U64(T0 + 4 + DAY_NS))
        .0;
    let before = env::storage_usage();
    set_env("next.sandbox", 1, T0 + 5);
    contract.accept_owner(U64(nonce));
    assert_eq!(env::storage_usage(), before, "accept grew storage");
    assert_eq!(contract.get_owner(), aid("next.sandbox"));
    assert!(contract.get_owner_proposal().is_none());
    set_env("next.sandbox", 1, T0 + 6);
    contract.propose_owner(aid("later.sandbox"), U64(T0 + 6 + DAY_NS));
    assert_eq!(env::storage_usage(), before, "proposal grew storage");
}

#[test]
#[should_panic(expected = "ERR_EXPIRED")]
fn owner_accept_at_expiry_fails() {
    let mut contract = init_contract();
    set_env("owner.sandbox", 1, T0);
    let nonce = contract
        .propose_owner(aid("next.sandbox"), U64(T0 + DAY_NS))
        .0;
    set_env("next.sandbox", 1, T0 + DAY_NS);
    contract.accept_owner(U64(nonce));
}

#[test]
#[should_panic(expected = "ERR_UNAUTHORIZED")]
fn owner_accept_rejects_the_current_owner() {
    let mut contract = init_contract();
    set_env("owner.sandbox", 1, T0);
    let nonce = contract
        .propose_owner(aid("next.sandbox"), U64(T0 + DAY_NS))
        .0;
    set_env("owner.sandbox", 1, T0 + 1);
    contract.accept_owner(U64(nonce));
}

#[test]
#[should_panic(expected = "ERR_BAD_EXPIRY")]
fn owner_proposal_rejects_more_than_seven_days() {
    let mut contract = init_contract();
    set_env("owner.sandbox", 1, T0);
    contract.propose_owner(aid("next.sandbox"), U64(T0 + 8 * DAY_NS));
}

#[test]
#[should_panic(expected = "ERR_INIT")]
fn init_rejects_a_predecessor_that_is_not_the_contract() {
    set_env("owner.sandbox", 0, T0);
    Contract::new(aid("owner.sandbox"));
}

#[test]
fn page_limit_caps_at_fifty() {
    let contract = setup();
    let actors = contract.list_actors(0, 51);
    assert_eq!(actors.len(), 6);
    assert_eq!(contract.list_actors(0, 0).len(), 0);
    assert_eq!(contract.list_actors(2, 2).len(), 2);
    assert_eq!(actors[2].account_id, aid("hospital.sandbox"));
}
