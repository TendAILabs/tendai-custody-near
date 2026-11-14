use near_api::types::AccessKeyPermission;
use near_api::types::transaction::actions::FunctionCallPermission;
use near_api::{AccountId, NearGas, NearToken};
use near_sdk::serde::Deserialize;
use near_sdk::serde_json::{Value, json};
use std::sync::{Arc, OnceLock};

fn wasm_bytes() -> &'static Vec<u8> {
    static WASM: OnceLock<Vec<u8>> = OnceLock::new();
    WASM.get_or_init(|| {
        let path = cargo_near_build::build_with_cli(Default::default()).expect("cargo near build");
        std::fs::read(path).expect("read wasm")
    })
}

fn hid(byte: u8) -> String {
    format!("{byte:02x}").repeat(32)
}

fn aid(name: &str) -> AccountId {
    name.parse().unwrap()
}

#[derive(Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
struct ShareOut {
    status: String,
    effective_status: String,
    kind: String,
}

async fn create_account(
    sandbox: &near_sandbox::Sandbox,
    name: &str,
) -> testresult::TestResult<near_api::Account> {
    sandbox
        .create_account(name.parse()?)
        .initial_balance(NearToken::from_near(30))
        .send()
        .await?;
    Ok(near_api::Account(aid(name)))
}

fn failure_text(err: impl std::fmt::Debug) -> String {
    format!("{err:?}")
}

#[tokio::test]
async fn sandbox_custody_rules() -> testresult::TestResult<()> {
    let wasm = wasm_bytes().clone();
    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let network = near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = near_api::Signer::from_secret_key(
        near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY
            .parse()
            .unwrap(),
    )?;

    let owner = create_account(&sandbox, "owner.sandbox").await?;
    let clinic = create_account(&sandbox, "clinic.sandbox").await?;
    let maya = create_account(&sandbox, "maya.sandbox").await?;
    let hospital = create_account(&sandbox, "hospital.sandbox").await?;
    let second = create_account(&sandbox, "second.sandbox").await?;
    let pulse = create_account(&sandbox, "pulse.sandbox").await?;
    let lakeside = create_account(&sandbox, "lakeside.sandbox").await?;
    let stranger = create_account(&sandbox, "stranger.sandbox").await?;
    let relay_id = aid("relay.sandbox");
    create_account(&sandbox, relay_id.as_str()).await?;
    let relay = near_api::Account(relay_id.clone()).as_contract();

    near_api::Contract::deploy(relay_id.clone())
        .use_code(wasm)
        .with_init_call("new", json!({ "owner": owner.account_id() }))?
        .with_signer(signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    let owner_view: AccountId = view(&relay, &network, "get_owner", json!({})).await?;
    assert_eq!(owner_view.as_str(), owner.account_id().as_str());
    let owner_empty: AccountId = view(&relay, &network, "get_owner", Value::Null).await?;
    assert_eq!(owner_empty.as_str(), owner.account_id().as_str());
    let staff: Vec<String> = view(&relay, &network, "staff_method_names", json!({})).await?;
    assert!(staff.iter().any(|name| name == "create_record"));
    let staff_empty: Vec<String> = view(&relay, &network, "staff_method_names", Value::Null).await?;
    assert_eq!(staff_empty, staff);

    for (account, role, name, key) in [
        (
            clinic.account_id(),
            "Clinic",
            "Riverbend Family Clinic",
            hid(0xaa),
        ),
        (maya.account_id(), "Patient", "Patient", hid(0xbb)),
        (
            hospital.account_id(),
            "Clinic",
            "St. Aster General",
            hid(0xcc),
        ),
        (
            second.account_id(),
            "Clinic",
            "Northgate Heart Institute",
            hid(0xdd),
        ),
        (pulse.account_id(), "App", "PulseFit", hid(0xee)),
        (
            lakeside.account_id(),
            "Clinic",
            "Lakeside Family Medicine",
            hid(0xab),
        ),
    ] {
        call(
            &relay,
            &network,
            &signer,
            owner.account_id(),
            "register_actor",
            json!({
                "account_id": account,
                "role": role,
                "display_name": name,
                "enc_pubkey": key,
            }),
            NearToken::from_near(1),
        )
        .await?
        .assert_success();
    }

    let actors: Vec<Value> = view(
        &relay,
        &network,
        "list_actors",
        json!({"from_index": 0, "limit": 20}),
    )
    .await?;
    assert_eq!(actors.len(), 6, "curated directory should list six actors");

    let unregistered = call(
        &relay,
        &network,
        &signer,
        stranger.account_id(),
        "create_record",
        record_args(maya.account_id(), 0x01),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let unregistered_err = failure_text(unregistered.assert_failure());
    assert!(
        unregistered_err.contains("ERR_NOT_REGISTERED"),
        "{unregistered_err}"
    );

    let record_tx = call(
        &relay,
        &network,
        &signer,
        clinic.account_id(),
        "create_record",
        record_args(maya.account_id(), 0x01),
        NearToken::from_yoctonear(0),
    )
    .await?;
    assert!(
        record_tx
            .logs()
            .iter()
            .any(|line| line.contains("record_created"))
    );
    let record_id: near_sdk::json_types::U64 = record_tx.assert_success().json()?;

    let referral_tx = call(
        &relay,
        &network,
        &signer,
        clinic.account_id(),
        "request_referral",
        json!({
            "request_id": hid(0x44),
            "record_id": record_id,
            "expected_epoch": "1",
            "to": hospital.account_id(),
            "requested_sections": ["history", "meds", "notes"],
            "purpose_hash": hid(0x44),
        }),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let referral_id: near_sdk::json_types::U64 = referral_tx.assert_success().json()?;

    let now = chain_time_ns(&network).await?;
    let month = now + 30 * 24 * 60 * 60 * 1_000_000_000;
    call(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "approve_share",
        json!({
            "share_id": referral_id,
            "granted_sections": ["history", "meds"],
            "expires_at_ns": month.to_string(),
            "read_only": true,
            "artifact_hash": hid(0x55),
            "tee_receipt_hash": hid(0x66),
        }),
        NearToken::from_yoctonear(1),
    )
    .await?
    .assert_success();

    let stranger_open = call(
        &relay,
        &network,
        &signer,
        stranger.account_id(),
        "request_open",
        json!({"share_id": referral_id, "nonce_hash": hid(0x10)}),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let stranger_err = failure_text(stranger_open.assert_failure());
    assert!(stranger_err.contains("ERR_UNAUTHORIZED"), "{stranger_err}");

    let other_clinic = call(
        &relay,
        &network,
        &signer,
        second.account_id(),
        "request_open",
        json!({"share_id": referral_id, "nonce_hash": hid(0x11)}),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let other_err = failure_text(other_clinic.assert_failure());
    assert!(other_err.contains("ERR_UNAUTHORIZED"), "{other_err}");

    call(
        &relay,
        &network,
        &signer,
        hospital.account_id(),
        "request_open",
        json!({"share_id": referral_id, "nonce_hash": hid(0x77)}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .assert_success();
    let fresh: bool = view(
        &relay,
        &network,
        "check_ticket",
        json!({"share_id": referral_id, "account_id": hospital.account_id(), "nonce_hash": hid(0x77)}),
    )
    .await?;
    assert!(fresh, "ticket must be fresh inside 120 seconds");

    let pending_tx = call(
        &relay,
        &network,
        &signer,
        clinic.account_id(),
        "request_referral",
        json!({
            "request_id": hid(0x45),
            "record_id": record_id,
            "expected_epoch": "1",
            "to": second.account_id(),
            "requested_sections": ["history"],
            "purpose_hash": hid(0x45),
        }),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let pending_id: near_sdk::json_types::U64 = pending_tx.assert_success().json()?;

    let fc_secret = near_api::types::crypto::secret_key::SecretKey::ED25519(
        near_api::types::crypto::secret_key::ED25519SecretKey::from_secret_key([9u8; 32]),
    );
    let fc_signer = near_api::Signer::from_secret_key(fc_secret.clone())?;
    maya.add_key(
        AccessKeyPermission::FunctionCall(FunctionCallPermission {
            allowance: Some(NearToken::from_near(1)),
            receiver_id: relay_id.to_string(),
            method_names: vec![
                "create_record".into(),
                "request_referral".into(),
                "request_open".into(),
                "request_owner_open".into(),
                "submit_reply".into(),
            ],
        }),
        fc_secret.public_key(),
    )
    .with_signer(signer.clone())
    .send_to(&network)
    .await?
    .assert_success();

    let fc_sent = relay
        .call_function(
            "approve_share",
            json!({
                "share_id": pending_id,
                "granted_sections": ["history"],
                "expires_at_ns": month.to_string(),
                "read_only": true,
                "artifact_hash": hid(0x56),
                "tee_receipt_hash": hid(0x67),
            }),
        )
        .transaction()
        .gas(NearGas::from_tgas(100))
        .deposit(NearToken::from_yoctonear(1))
        .with_signer(maya.account_id().clone(), fc_signer.clone())
        .send_to(&network)
        .await;
    let fc_note = match fc_sent {
        Ok(tx) => {
            assert!(
                tx.is_failure(),
                "function-call key must not approve a share"
            );
            let text = failure_text(tx.assert_failure());
            assert!(!text.contains("ERR_NOT_FOUND"), "{text}");
            text
        }
        Err(err) => {
            let text = format!("{err:?}");
            assert!(
                text.contains("InvalidTransaction")
                    || text.contains("AccessKey")
                    || text.contains("Method")
                    || text.contains("deposit"),
                "unexpected function-call rejection: {text}"
            );
            text
        }
    };
    let pending: ShareOut = view(
        &relay,
        &network,
        "get_share",
        json!({"share_id": pending_id}),
    )
    .await?;
    assert_eq!(
        pending.status, "Requested",
        "fc key left the share untouched: {fc_note}"
    );

    let opinion_tx = call(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "create_share",
        json!({
            "request_id": hid(0x81),
            "record_id": record_id,
            "expected_epoch": "1",
            "to": second.account_id(),
            "kind": "SecondOpinion",
            "sections": ["history"],
            "expires_at_ns": month.to_string(),
            "read_only": true,
            "purpose_hash": hid(0x81),
            "artifact_hash": hid(0x82),
            "tee_receipt_hash": hid(0x83),
            "parent": referral_id,
        }),
        NearToken::from_yoctonear(1),
    )
    .await?;
    let opinion_id: near_sdk::json_types::U64 = opinion_tx.assert_success().json()?;

    call(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "create_share",
        json!({
            "request_id": hid(0x84),
            "record_id": record_id,
            "expected_epoch": "1",
            "to": lakeside.account_id(),
            "kind": "Transfer",
            "sections": ["history", "meds", "notes"],
            "expires_at_ns": Value::Null,
            "read_only": false,
            "purpose_hash": hid(0x84),
            "artifact_hash": hid(0x85),
            "tee_receipt_hash": Value::Null,
            "parent": Value::Null,
        }),
        NearToken::from_yoctonear(1),
    )
    .await?
    .assert_success();

    let deid_tx = call(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "create_share",
        json!({
            "request_id": hid(0x86),
            "record_id": record_id,
            "expected_epoch": "1",
            "to": pulse.account_id(),
            "kind": "DeidApp",
            "sections": [],
            "expires_at_ns": month.to_string(),
            "read_only": true,
            "purpose_hash": hid(0x86),
            "artifact_hash": hid(0x87),
            "tee_receipt_hash": hid(0x89),
            "parent": Value::Null,
        }),
        NearToken::from_yoctonear(1),
    )
    .await?;
    let deid_id: near_sdk::json_types::U64 = deid_tx.assert_success().json()?;
    let deid: ShareOut = view(&relay, &network, "get_share", json!({"share_id": deid_id})).await?;
    assert_eq!(deid.kind, "DeidApp");
    assert_eq!(deid.effective_status, "Active");

    let reshare = call(
        &relay,
        &network,
        &signer,
        hospital.account_id(),
        "create_share",
        json!({
            "request_id": hid(0x88),
            "record_id": record_id,
            "expected_epoch": "1",
            "to": second.account_id(),
            "kind": "SecondOpinion",
            "sections": ["history"],
            "expires_at_ns": month.to_string(),
            "read_only": true,
            "purpose_hash": hid(0x88),
            "artifact_hash": hid(0x89),
            "tee_receipt_hash": Value::Null,
            "parent": referral_id,
        }),
        NearToken::from_yoctonear(1),
    )
    .await?;
    let reshare_err = failure_text(reshare.assert_failure());
    assert!(
        reshare_err.contains("ERR_UNAUTHORIZED"),
        "recipient cannot re-share: {reshare_err}"
    );

    let deid_clinic = call(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "create_share",
        json!({
            "request_id": hid(0x8a),
            "record_id": record_id,
            "expected_epoch": "1",
            "to": hospital.account_id(),
            "kind": "DeidApp",
            "sections": ["notes"],
            "expires_at_ns": month.to_string(),
            "read_only": true,
            "purpose_hash": hid(0x8a),
            "artifact_hash": hid(0x8b),
            "tee_receipt_hash": Value::Null,
            "parent": Value::Null,
        }),
        NearToken::from_yoctonear(1),
    )
    .await?;
    let deid_clinic_err = failure_text(deid_clinic.assert_failure());
    assert!(
        deid_clinic_err.contains("ERR_BAD_ROLE"),
        "DeidApp to a clinic is rejected: {deid_clinic_err}"
    );

    call(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "revoke_share",
        json!({"share_id": opinion_id}),
        NearToken::from_yoctonear(1),
    )
    .await?
    .assert_success();
    call(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "revoke_share",
        json!({"share_id": deid_id}),
        NearToken::from_yoctonear(1),
    )
    .await?
    .assert_success();
    let revoked_open = call(
        &relay,
        &network,
        &signer,
        second.account_id(),
        "request_open",
        json!({"share_id": opinion_id, "nonce_hash": hid(0x90)}),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let revoked_err = failure_text(revoked_open.assert_failure());
    assert!(revoked_err.contains("ERR_REVOKED"), "{revoked_err}");
    let revoked_deid: ShareOut =
        view(&relay, &network, "get_share", json!({"share_id": deid_id})).await?;
    assert_eq!(revoked_deid.effective_status, "Revoked");

    let before = chain_time_ns(&network).await?;
    let short_expiry = before + 2_000_000_000;
    let short_tx = call(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "create_share",
        json!({
            "request_id": hid(0x91),
            "record_id": record_id,
            "expected_epoch": "1",
            "to": hospital.account_id(),
            "kind": "SecondOpinion",
            "sections": ["meds"],
            "expires_at_ns": short_expiry.to_string(),
            "read_only": true,
            "purpose_hash": hid(0x91),
            "artifact_hash": hid(0x92),
            "tee_receipt_hash": Value::Null,
            "parent": Value::Null,
        }),
        NearToken::from_yoctonear(1),
    )
    .await?;
    let short_id: near_sdk::json_types::U64 = short_tx.assert_success().json()?;

    sandbox.fast_forward(800).await?;
    let after = chain_time_ns(&network).await?;
    assert!(
        after > before + 120 * 1_000_000_000,
        "sandbox time moved {before} -> {after}"
    );

    let stale: bool = view(
        &relay,
        &network,
        "check_ticket",
        json!({"share_id": referral_id, "account_id": hospital.account_id(), "nonce_hash": hid(0x77)}),
    )
    .await?;
    assert!(
        !stale,
        "check_ticket must fail once the ticket is older than 120 seconds"
    );

    let expired_open = call(
        &relay,
        &network,
        &signer,
        hospital.account_id(),
        "request_open",
        json!({"share_id": short_id, "nonce_hash": hid(0x93)}),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let expired_err = failure_text(expired_open.assert_failure());
    assert!(expired_err.contains("ERR_EXPIRED"), "{expired_err}");

    let still: ShareOut = view(
        &relay,
        &network,
        "get_share",
        json!({"share_id": referral_id}),
    )
    .await?;
    assert_eq!(still.effective_status, "Active");

    let visitor = create_account(&sandbox, "visitor.sandbox").await?;
    let short_deposit = call(
        &relay,
        &network,
        &signer,
        visitor.account_id(),
        "self_register_patient",
        json!({ "enc_pubkey": hid(0x42) }),
        NearToken::from_yoctonear(1),
    )
    .await?;
    let short_err = failure_text(short_deposit.assert_failure());
    assert!(short_err.contains("ERR_STORAGE"), "{short_err}");

    let unknown = call(
        &relay,
        &network,
        &signer,
        visitor.account_id(),
        "self_register_patient",
        json!({ "enc_pubkey": hid(0x42), "role": "Clinic" }),
        NearToken::from_near(1),
    )
    .await?;
    let unknown_err = failure_text(unknown.assert_failure());
    assert!(
        unknown_err.contains("Failed to deserialize input from JSON"),
        "{unknown_err}"
    );

    let extra_owner = call(
        &relay,
        &network,
        &signer,
        owner.account_id(),
        "register_actor",
        json!({
            "account_id": visitor.account_id(),
            "role": "Patient",
            "display_name": "Patient",
            "enc_pubkey": hid(0x42),
            "extra": "no",
        }),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let extra_err = failure_text(extra_owner.assert_failure());
    assert!(
        extra_err.contains("Failed to deserialize input from JSON"),
        "{extra_err}"
    );

    let clinic_self = call(
        &relay,
        &network,
        &signer,
        clinic.account_id(),
        "self_register_patient",
        json!({ "enc_pubkey": hid(0x43) }),
        NearToken::from_near(1),
    )
    .await?;
    let clinic_err = failure_text(clinic_self.assert_failure());
    assert!(clinic_err.contains("ERR_ALREADY_REGISTERED"), "{clinic_err}");

    let balance_before = account_yocto(&network, visitor.account_id()).await?;
    let registered = call(
        &relay,
        &network,
        &signer,
        visitor.account_id(),
        "self_register_patient",
        json!({ "enc_pubkey": hid(0x42) }),
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        registered
            .logs()
            .iter()
            .any(|line| line.contains("actor_registered") && line.contains("Patient"))
    );
    registered.assert_success();
    let balance_after = account_yocto(&network, visitor.account_id()).await?;
    let spent = balance_before.saturating_sub(balance_after);
    assert!(
        spent < 200_000_000_000_000_000_000_000,
        "excess storage deposit was not refunded, spent {spent}"
    );

    let again = call(
        &relay,
        &network,
        &signer,
        visitor.account_id(),
        "self_register_patient",
        json!({ "enc_pubkey": hid(0x42) }),
        NearToken::from_near(1),
    )
    .await?;
    let again_err = failure_text(again.assert_failure());
    assert!(again_err.contains("ERR_ALREADY_REGISTERED"), "{again_err}");

    let visitor_record = call(
        &relay,
        &network,
        &signer,
        clinic.account_id(),
        "create_record",
        record_args(visitor.account_id(), 0x02),
        NearToken::from_yoctonear(0),
    )
    .await?;
    visitor_record.assert_success();

    let actors: Vec<Value> = view(
        &relay,
        &network,
        "list_actors",
        json!({"from_index": 0, "limit": 20}),
    )
    .await?;
    assert!(
        actors.iter().any(|actor| actor["account_id"] == visitor.account_id().as_str()
            && actor["role"] == "Patient"
            && actor["display_name"] == "Patient"),
        "{actors:?}"
    );
    Ok(())
}

#[tokio::test]
async fn sandbox_v2_scale() -> testresult::TestResult<()> {
    let wasm = wasm_bytes().clone();
    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let network = near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = near_api::Signer::from_secret_key(
        near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY
            .parse()
            .unwrap(),
    )?;
    let owner = create_account(&sandbox, "owner.sandbox").await?;
    let clinic = create_account(&sandbox, "clinic.sandbox").await?;
    let maya = create_account(&sandbox, "maya.sandbox").await?;
    let hospital = create_account(&sandbox, "hospital.sandbox").await?;
    let other = create_account(&sandbox, "other.sandbox").await?;
    let relay_id = aid("relay.sandbox");
    create_account(&sandbox, relay_id.as_str()).await?;
    let relay = near_api::Account(relay_id.clone()).as_contract();
    near_api::Contract::deploy(relay_id.clone())
        .use_code(wasm)
        .with_init_call("new", json!({ "owner": owner.account_id() }))?
        .with_signer(signer.clone())
        .send_to(&network)
        .await?
        .assert_success();
    let second_init = call(
        &relay,
        &network,
        &signer,
        &relay_id,
        "new",
        json!({ "owner": owner.account_id() }),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let init_err = failure_text(second_init.assert_failure());
    assert!(
        init_err.contains("already been initialized"),
        "second init must fail: {init_err}"
    );

    for (account, role, name, key) in [
        (clinic.account_id(), "Clinic", "Riverbend Family Clinic", hid(0xaa)),
        (maya.account_id(), "Patient", "Patient", hid(0xbb)),
        (hospital.account_id(), "Clinic", "St. Aster General", hid(0xcc)),
        (other.account_id(), "Patient", "Patient", hid(0xbc)),
    ] {
        call(
            &relay,
            &network,
            &signer,
            owner.account_id(),
            "register_actor",
            json!({
                "account_id": account,
                "role": role,
                "display_name": name,
                "enc_pubkey": key,
            }),
            NearToken::from_near(1),
        )
        .await?
        .assert_success();
    }

    let created = call(
        &relay,
        &network,
        &signer,
        clinic.account_id(),
        "create_record",
        record_args(maya.account_id(), 0x21),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let record_id: near_sdk::json_types::U64 = created.assert_success().json()?;
    let replay = call(
        &relay,
        &network,
        &signer,
        clinic.account_id(),
        "create_record",
        record_args(maya.account_id(), 0x21),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let replay_success = replay.assert_success();
    assert!(
        !replay_success
            .logs()
            .iter()
            .any(|line| line.contains("record_created")),
        "replay must not emit a second record"
    );
    let replay_id: near_sdk::json_types::U64 = replay_success.json()?;
    assert_eq!(replay_id, record_id);

    let parent = call(
        &relay,
        &network,
        &signer,
        clinic.account_id(),
        "request_referral",
        json!({
            "request_id": hid_n(1),
            "record_id": record_id,
            "expected_epoch": "1",
            "to": hospital.account_id(),
            "requested_sections": ["history"],
            "purpose_hash": hid(0x44),
        }),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let parent_id: near_sdk::json_types::U64 = parent.assert_success().json()?;
    let now = chain_time_ns(&network).await?;
    call(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "approve_share",
        json!({
            "share_id": parent_id,
            "granted_sections": ["history"],
            "expires_at_ns": (now + 30 * 24 * 60 * 60 * 1_000_000_000).to_string(),
            "read_only": true,
            "artifact_hash": hid(0x55),
            "tee_receipt_hash": hid(0x66),
        }),
        NearToken::from_yoctonear(1),
    )
    .await?
    .assert_success();
    let reply = call(
        &relay,
        &network,
        &signer,
        hospital.account_id(),
        "submit_reply",
        json!({
            "request_id": hid_n(2),
            "share_id": parent_id,
            "expected_epoch": "1",
            "reply_hash": hid(0x91),
        }),
        NearToken::from_yoctonear(0),
    )
    .await?;
    let reply_id: near_sdk::json_types::U64 = reply.assert_success().json()?;

    for index in 0..1_000u32 {
        if index % 250 == 0 {
            eprintln!("sandbox_v2_scale referrals {index}");
        }
        call(
            &relay,
            &network,
            &signer,
            clinic.account_id(),
            "request_referral",
            json!({
                "request_id": hid_n(1_000 + index),
                "record_id": record_id,
                "expected_epoch": "1",
                "to": hospital.account_id(),
                "requested_sections": ["notes"],
                "purpose_hash": hid(0x45),
            }),
            NearToken::from_yoctonear(0),
        )
        .await?
        .assert_success();
    }

    let first_shares = page_gas(
        &relay,
        &network,
        &signer,
        clinic.account_id(),
        "list_shares_for_record",
        json!({"record_id": record_id, "from_index": 0, "limit": 50}),
    )
    .await?;
    let far_shares = page_gas(
        &relay,
        &network,
        &signer,
        clinic.account_id(),
        "list_shares_for_record",
        json!({"record_id": record_id, "from_index": 950, "limit": 50}),
    )
    .await?;
    assert!(first_shares > 0 && far_shares > 0, "{first_shares} {far_shares}");
    let share_ratio = far_shares as f64 / first_shares as f64;
    assert!(
        share_ratio < 3.0,
        "share page gas first={first_shares} far={far_shares}"
    );
    let pending_before = page_gas(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "list_pending_for_patient",
        json!({"patient": maya.account_id(), "from_index": 0, "limit": 50}),
    )
    .await?;
    let pending_far = page_gas(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "list_pending_for_patient",
        json!({"patient": maya.account_id(), "from_index": 950, "limit": 50}),
    )
    .await?;
    let pending_ratio = pending_far as f64 / pending_before as f64;
    assert!(
        pending_ratio < 3.0,
        "pending page gas first={pending_before} far={pending_far}"
    );

    for index in 0..1_000u32 {
        if index % 250 == 0 {
            eprintln!("sandbox_v2_scale unrelated records {index}");
        }
        call(
            &relay,
            &network,
            &signer,
            clinic.account_id(),
            "create_record",
            json!({
                "request_id": hid_n(50_000 + index),
                "patient": other.account_id(),
                "sections": [{"key": "history", "cipher_hash": hid(0x11)}],
            }),
            NearToken::from_yoctonear(0),
        )
        .await?
        .assert_success();
    }
    let pending_after = page_gas(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "list_pending_for_patient",
        json!({"patient": maya.account_id(), "from_index": 0, "limit": 50}),
    )
    .await?;
    let unrelated_ratio = pending_after as f64 / pending_before as f64;
    assert!(
        unrelated_ratio < 1.5,
        "unrelated records changed pending gas {pending_before} -> {pending_after}"
    );

    let before_open = account_storage(&network, &relay_id).await?;
    for index in 0..1_000u32 {
        if index % 250 == 0 {
            eprintln!("sandbox_v2_scale opens {index}");
        }
        call(
            &relay,
            &network,
            &signer,
            hospital.account_id(),
            "request_open",
            json!({"share_id": parent_id, "nonce_hash": hid_n(80_000 + index)}),
            NearToken::from_yoctonear(0),
        )
        .await?
        .assert_success();
    }
    let after_open = account_storage(&network, &relay_id).await?;
    assert_eq!(
        before_open, after_open,
        "1,000 opens grew storage {before_open} -> {after_open}"
    );

    let viewed = near_api::Account(relay_id.clone())
        .view()
        .fetch_from(&network)
        .await?;
    let usage = viewed.data.storage_usage;
    let balance = viewed.data.amount.as_yoctonear();
    // Storage stake is 10^19 yoctoNEAR per byte. The sender also prepays gas from
    // this balance, so the cushion is gas, not room for another state row.
    let stake = u128::from(usage).saturating_mul(10_000_000_000_000_000_000);
    let gas_cushion = 200_000_000_000_000_000_000_000u128; // 0.2 NEAR, gas prepay only
    let keep = stake.saturating_add(gas_cushion);
    let liquid = balance.saturating_sub(keep);
    eprintln!("sandbox_v2_scale drain balance={balance} usage={usage} liquid={liquid}");
    if liquid > 0 {
        near_api::Tokens::account(relay_id.clone())
            .send_to(owner.account_id().clone())
            .near(NearToken::from_yoctonear(liquid))
            .with_signer(signer.clone())
            .send_to(&network)
            .await?
            .assert_success();
    }
    let before_revoke_storage = account_storage(&network, &relay_id).await?;
    let revoke = call(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "revoke_all_for_record",
        json!({"record_id": record_id, "expected_epoch": "1"}),
        NearToken::from_yoctonear(1),
    )
    .await?;
    let revoke_success = revoke.assert_success();
    let revoke_gas = revoke_success.total_gas_burnt.as_gas();
    let revoke_logs = revoke_success.logs();
    assert_eq!(
        revoke_logs
            .iter()
            .filter(|line| line.contains("record_grants_revoked"))
            .count(),
        1
    );
    let after_revoke_storage = account_storage(&network, &relay_id).await?;
    assert_eq!(
        before_revoke_storage, after_revoke_storage,
        "revoke-all grew storage {before_revoke_storage} -> {after_revoke_storage}"
    );
    assert!(
        revoke_gas < 50_000_000_000_000,
        "revoke-all gas {revoke_gas} is not well under 300 Tgas; pages share {first_shares}/{far_shares} pending {pending_before}/{pending_far}/{pending_after}"
    );
    eprintln!(
        "sandbox_v2_scale share_page_gas={first_shares}/{far_shares} pending_page_gas={pending_before}/{pending_far} pending_after_unrelated={pending_after} revoke_all_gas={revoke_gas} opens_storage={after_open}"
    );
    for share_id in [parent_id, reply_id] {
        let view: ShareOut = view(
            &relay,
            &network,
            "get_share",
            json!({"share_id": share_id}),
        )
        .await?;
        assert_eq!(view.effective_status, "Revoked", "{share_id:?} {view:?}");
    }
    let retry = call(
        &relay,
        &network,
        &signer,
        maya.account_id(),
        "revoke_all_for_record",
        json!({"record_id": record_id, "expected_epoch": "1"}),
        NearToken::from_yoctonear(1),
    )
    .await?;
    let retry_success = retry.assert_success();
    assert!(
        !retry_success
            .logs()
            .iter()
            .any(|line| line.contains("record_grants_revoked"))
    );
    Ok(())
}

fn hid_n(index: u32) -> String {
    let mut bytes = [0u8; 32];
    bytes[0..4].copy_from_slice(&index.to_le_bytes());
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

async fn page_gas(
    contract: &near_api::Contract,
    network: &near_api::NetworkConfig,
    signer: &Arc<near_api::Signer>,
    account: &AccountId,
    method: &str,
    args: Value,
) -> testresult::TestResult<u64> {
    let tx = call(
        contract,
        network,
        signer,
        account,
        method,
        args,
        NearToken::from_yoctonear(0),
    )
    .await?;
    Ok(tx.assert_success().total_gas_burnt.as_gas())
}

async fn account_storage(
    network: &near_api::NetworkConfig,
    account: &AccountId,
) -> testresult::TestResult<u64> {
    let viewed = near_api::Account(account.clone())
        .view()
        .fetch_from(network)
        .await?;
    Ok(viewed.data.storage_usage)
}

async fn account_yocto(
    network: &near_api::NetworkConfig,
    account: &AccountId,
) -> testresult::TestResult<u128> {
    let viewed = near_api::Account(account.clone())
        .view()
        .fetch_from(network)
        .await?;
    Ok(viewed.data.amount.as_yoctonear())
}

async fn chain_time_ns(network: &near_api::NetworkConfig) -> testresult::TestResult<u64> {
    let block = near_api::Chain::block().fetch_from(network).await?;
    Ok(block.header.timestamp_nanosec.parse()?)
}

async fn call(
    contract: &near_api::Contract,
    network: &near_api::NetworkConfig,
    signer: &Arc<near_api::Signer>,
    account: &AccountId,
    method: &str,
    args: Value,
    deposit: NearToken,
) -> testresult::TestResult<near_api::types::transaction::result::TransactionResult> {
    Ok(contract
        .call_function(method, args)
        .transaction()
        .gas(NearGas::from_tgas(100))
        .deposit(deposit)
        .with_signer(account.clone(), signer.clone())
        .send_to(network)
        .await
        .map_err(|err| std::io::Error::other(format!("{method} deposit={deposit}: {err:?}")))?)
}

async fn view<T: near_sdk::serde::de::DeserializeOwned + Send + Sync>(
    contract: &near_api::Contract,
    network: &near_api::NetworkConfig,
    method: &str,
    args: Value,
) -> testresult::TestResult<T> {
    Ok(contract
        .call_function(method, args)
        .read_only()
        .fetch_from(network)
        .await?
        .data)
}

fn record_args(patient: &AccountId, tag: u8) -> Value {
    json!({
        "request_id": hid(tag),
        "patient": patient,
        "sections": [
            {"key": "history", "cipher_hash": hid(0x11)},
            {"key": "meds", "cipher_hash": hid(0x22)},
            {"key": "notes", "cipher_hash": hid(0x33)}
        ]
    })
}
