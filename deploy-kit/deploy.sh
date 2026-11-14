#!/usr/bin/env bash
# Deploy the committed schema 2 wasm and register the six actors.
# Refuses mainnet. Does not compile. Does not print a private key.
# Verifies the wasm sha256 before any network call.
#
# Deploy and call shapes are from https://docs.near.org/tools/cli.md and
# https://docs.near.org/smart-contracts/quickstart.md . The signer is
# sign-with-access-key-file from
# https://github.com/near/near-cli-rs/blob/main/docs/GUIDE.en.md .
set -euo pipefail

KIT="$(cd "$(dirname "$0")" && pwd)"
WASM="${KIT}/referral_relay.wasm"
EXPECTED_SHA256="67b2ec90989a2f6b6afbebb1b77061b479c65f787943f82ac0cd61ab478e5d3b"

if [[ "${NEAR_ENV:-}" == "mainnet" || "${NEAR_NETWORK:-}" == "mainnet" || "${NEAR_NETWORK_ID:-}" == "mainnet" ]]; then
  echo "This script is testnet only." >&2
  exit 1
fi

for tool in near openssl node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing ${tool}." >&2
    exit 1
  fi
done

if [[ ! -f "$WASM" ]]; then
  echo "Missing ${WASM}." >&2
  exit 1
fi

actual="$(openssl dgst -sha256 "$WASM" | awk '{print $NF}')"
if [[ "$actual" != "$EXPECTED_SHA256" ]]; then
  echo "Wasm sha256 does not match the reproducible build." >&2
  echo "Expected ${EXPECTED_SHA256}" >&2
  echo "Actual   ${actual}" >&2
  exit 1
fi
echo "Wasm sha256 ${actual}"

if [[ -z "${SECRETS_DIR:-}" && -f "${HOME}/.tendai-v2/latest" ]]; then
  SECRETS_DIR="$(cat "${HOME}/.tendai-v2/latest")"
fi
if [[ -z "${SECRETS_DIR:-}" || ! -f "${SECRETS_DIR}/public.env" ]]; then
  echo "Set SECRETS_DIR to the directory provision.sh printed." >&2
  exit 1
fi
case "$SECRETS_DIR" in
  "$KIT"|"$KIT"/*)
    echo "SECRETS_DIR must be outside the kit folder." >&2
    exit 1
    ;;
esac

set -a
# public.env has account ids and encryption public keys only.
# shellcheck disable=SC1091
source "${SECRETS_DIR}/public.env"
set +a

required=(
  CONTRACT_ACCOUNT_ID
  OWNER_ACCOUNT_ID
  CLINIC_ACCOUNT_ID
  HOSPITAL_ACCOUNT_ID
  SECOND_ACCOUNT_ID
  LAKESIDE_ACCOUNT_ID
  PULSEFIT_ACCOUNT_ID
  PATIENT_ACCOUNT_ID
  CLINIC_ENC_PUBKEY
  HOSPITAL_ENC_PUBKEY
  SECOND_ENC_PUBKEY
  LAKESIDE_ENC_PUBKEY
  PULSEFIT_ENC_PUBKEY
  PATIENT_ENC_PUBKEY
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing ${name}." >&2
    exit 1
  fi
  if [[ "${!name}" == *.near ]]; then
    echo "Refusing a mainnet account id." >&2
    exit 1
  fi
done

for name in CLINIC_ENC_PUBKEY HOSPITAL_ENC_PUBKEY SECOND_ENC_PUBKEY LAKESIDE_ENC_PUBKEY PULSEFIT_ENC_PUBKEY PATIENT_ENC_PUBKEY; do
  if [[ ! "${!name}" =~ ^[0-9a-fA-F]{64}$ ]]; then
    echo "${name} must be 64 hex characters." >&2
    exit 1
  fi
done

owner_key="${SECRETS_DIR}/keys/owner-full.json"
contract_key="${SECRETS_DIR}/keys/contract-full.json"
if [[ ! -f "$owner_key" || ! -f "$contract_key" ]]; then
  echo "Missing the owner or contract key file under ${SECRETS_DIR}/keys." >&2
  exit 1
fi

redact_output() {
  node -e '
    let text = "";
    process.stdin.on("data", (chunk) => { text += chunk; });
    process.stdin.on("end", () => {
      process.stdout.write(text.replace(/ed25519:([1-9A-HJ-NP-Za-km-z]+)/g, (all, body) => (body.length > 60 ? "ed25519:[redacted]" : all)));
    });
  '
}

print_tx() {
  local label="$1"
  local output="$2"
  printf '%s\n' "${output}" | redact_output
  local hash
  hash="$(printf '%s\n' "${output}" | awk '/[Tt]ransaction ID/ { print $NF; exit }')"
  if [[ -n "${hash}" ]]; then
    echo "${label} tx ${hash}"
  else
    echo "${label} finished. The transaction id is in the CLI output above."
  fi
}

view_node() {
  local out status
  status=0
  out="$(node "$KIT/near-view.mjs" "$@")" || status=$?
  if [[ "$status" -eq 75 ]]; then
    echo "The NEAR RPC is rate limiting a view. Pausing 20 seconds, then trying again. No key was printed." >&2
    sleep 20
    node "$KIT/near-view.mjs" "$@"
    return
  fi
  if [[ "$status" -ne 0 ]]; then
    echo "A view call failed. No key was printed." >&2
    exit 1
  fi
  printf '%s' "$out"
}

view_call() {
  view_node call "$CONTRACT_ACCOUNT_ID" "$1" "$2"
}

code_hash="$(view_node code "$CONTRACT_ACCOUNT_ID")"
owner_now=""
if [[ "$code_hash" != "missing" && "$code_hash" != "11111111111111111111111111111111" && -n "$code_hash" ]]; then
  owner_now="$(view_call get_owner '{}')"
fi

if [[ "$owner_now" == "\"${OWNER_ACCOUNT_ID}\"" ]]; then
  echo "Contract already initialized for ${OWNER_ACCOUNT_ID}. Skipping deploy."
else
  if [[ -n "$owner_now" && "$owner_now" != "null" ]]; then
    echo "The contract is already initialized for a different owner. Stop." >&2
    exit 1
  fi
  init_args="$(printf '{"owner":"%s"}' "${OWNER_ACCOUNT_ID}")"
  if ! deploy_out="$(near contract deploy "${CONTRACT_ACCOUNT_ID}" \
    use-file "${WASM}" \
    with-init-call new json-args "${init_args}" \
    prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
    network-config testnet \
    sign-with-access-key-file "${contract_key}" \
    send 2>&1)"; then
    printf '%s\n' "$deploy_out" | redact_output >&2
    echo "Deploy failed. No key was printed." >&2
    exit 1
  fi
  print_tx "deploy" "$deploy_out"
fi

register() {
  local account="$1"
  local role="$2"
  local display="$3"
  local pubkey="$4"
  local existing
  existing="$(view_call get_actor "$(printf '{"account_id":"%s"}' "$account")")"
  if [[ "$existing" != "null" && "$existing" != "missing" && -n "$existing" ]]; then
    echo "Actor ${account} is already registered. Skipping."
    return 0
  fi
  local args output
  args="$(printf '{"account_id":"%s","role":"%s","display_name":"%s","enc_pubkey":"%s"}' \
    "${account}" "${role}" "${display}" "${pubkey}")"
  if ! output="$(near contract call-function as-transaction "${CONTRACT_ACCOUNT_ID}" register_actor \
    json-args "${args}" \
    prepaid-gas '100 Tgas' attached-deposit '0.1 NEAR' \
    sign-as "${OWNER_ACCOUNT_ID}" \
    network-config testnet \
    sign-with-access-key-file "${owner_key}" \
    send 2>&1)"; then
    printf '%s\n' "$output" | redact_output >&2
    echo "Registration failed for ${account}. No key was printed." >&2
    exit 1
  fi
  print_tx "register ${account}" "$output"
}

register "${CLINIC_ACCOUNT_ID}" Clinic "Riverbend Family Clinic" "${CLINIC_ENC_PUBKEY}"
register "${HOSPITAL_ACCOUNT_ID}" Clinic "St. Aster Hospital" "${HOSPITAL_ENC_PUBKEY}"
register "${SECOND_ACCOUNT_ID}" Clinic "Northgate Heart Institute" "${SECOND_ENC_PUBKEY}"
register "${LAKESIDE_ACCOUNT_ID}" Clinic "Lakeside Family Medicine" "${LAKESIDE_ENC_PUBKEY}"
register "${PULSEFIT_ACCOUNT_ID}" App "PulseFit" "${PULSEFIT_ENC_PUBKEY}"
register "${PATIENT_ACCOUNT_ID}" Patient "Patient" "${PATIENT_ENC_PUBKEY}"

echo "Deploy finished for ${CONTRACT_ACCOUNT_ID}."
