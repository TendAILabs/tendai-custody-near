#!/usr/bin/env bash
# Create a fresh testnet contract account, an owner, and the six actor
# accounts, then add one function-call key per actor.
#
# Run this from the kit folder on a Mac. It refuses mainnet. It does not print
# a private key. Private keys are written only under SECRETS_DIR, outside this
# folder, mode 600. A second run with the same SECRETS_DIR skips an account
# that already has the saved full-access key, and skips a function-call key
# that is already on the account.
#
# Commands, from https://docs.near.org/tools/cli.md ,
# https://docs.near.org/getting-started/create-account.md , and the near-cli-rs
# guide https://github.com/near/near-cli-rs/blob/main/docs/GUIDE.en.md :
#
# near-cli-rs 0.31.1 has no generate-keypair command. Key files are made with:
#   near account create-account fund-later use-auto-generation save-to-folder "$DIR"
# That writes one json file. This script keeps only public_key and private_key.
# It deletes master_seed_phrase and seed_phrase_hd_path and does not print them.
#   near account create-account sponsor-by-faucet-service "$ACCOUNT_ID" \
#     use-manually-provided-public-key "$PUBLIC_KEY" network-config testnet create
#   near account add-key "$ACCOUNT_ID" grant-function-call-access \
#     --allowance '1 NEAR' --contract-account-id "$CONTRACT_ID" \
#     --function-names 'method_a,method_b' \
#     use-manually-provided-public-key "$PUBLIC_KEY" \
#     network-config testnet sign-with-access-key-file "$FULL_KEY_FILE" send
#
# A function-call key cannot attach NEAR
# (https://docs.near.org/protocol/accounts-contracts/access-keys.md).
# Patient consent methods attach 1 yoctoNEAR, so DEMO_PATIENT_PRIVATE_KEY is
# the full-access key.
#
# Method lists below are copied from web/lib/near/sign-allow.ts METHOD_ROLES.
# web/lib/near/kit.test.ts fails if they drift.
# Encryption public keys use enc-public.mjs, the same HKDF as
# web/lib/crypto/actor-key.ts. The salt is the account id. The info string is
# referral-relay/v1/actor.
set -euo pipefail

KIT="$(cd "$(dirname "$0")" && pwd)"

if [[ "${NEAR_ENV:-}" == "mainnet" || "${NEAR_NETWORK:-}" == "mainnet" || "${NEAR_NETWORK_ID:-}" == "mainnet" ]]; then
  echo "This script is testnet only." >&2
  exit 1
fi

for tool in near jq openssl node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing ${tool}." >&2
    exit 1
  fi
done

# KIT_METHODS_BEGIN
methods_for() {
  case "$1" in
    clinic) printf '%s' 'create_record,request_referral' ;;
    hospital) printf '%s' 'request_open,submit_reply' ;;
    second) printf '%s' 'request_open,submit_reply' ;;
    app) printf '%s' 'request_open' ;;
    patient) printf '%s' 'approve_share,decline_share,create_share,revoke_share,revoke_all_for_record' ;;
    *) return 1 ;;
  esac
}
# KIT_METHODS_END

latest="${HOME}/.tendai-v2/latest"
if [[ -z "${SECRETS_DIR:-}" && -n "${ACCOUNT_PREFIX:-}" ]]; then
  SECRETS_DIR="${HOME}/.tendai-v2/${ACCOUNT_PREFIX}"
elif [[ -z "${SECRETS_DIR:-}" && -f "$latest" ]]; then
  SECRETS_DIR="$(cat "$latest")"
  echo "Resuming ${SECRETS_DIR}"
elif [[ -z "${SECRETS_DIR:-}" ]]; then
  SECRETS_DIR="${HOME}/.tendai-v2/rr$(openssl rand -hex 4)"
fi

case "$SECRETS_DIR" in
  "$KIT"|"$KIT"/*)
    echo "SECRETS_DIR must be outside the kit folder." >&2
    exit 1
    ;;
esac

umask 077
mkdir -p "$SECRETS_DIR/keys" "${HOME}/.tendai-v2"
chmod 700 "$SECRETS_DIR" "$SECRETS_DIR/keys"
printf '%s\n' "$SECRETS_DIR" >"$latest"
VERCEL_ENV="$SECRETS_DIR/vercel.env"
PUBLIC_ENV="$SECRETS_DIR/public.env"
STATE="$SECRETS_DIR/accounts.env"
LOG="$SECRETS_DIR/cli.log"
chmod 600 "$LOG" 2>/dev/null || true

if [[ -f "$STATE" ]]; then
  # shellcheck disable=SC1090
  source "$STATE"
  echo "Resuming saved accounts for prefix ${PREFIX}"
else
  PREFIX="${ACCOUNT_PREFIX:-$(basename "$SECRETS_DIR")}"
  if [[ ! "$PREFIX" =~ ^[a-z][a-z0-9-]{1,24}[a-z0-9]$ ]]; then
    echo "ACCOUNT_PREFIX must be a short lowercase account label." >&2
    exit 1
  fi
  CONTRACT_ID="${PREFIX}-contract.testnet"
  OWNER_ID="${PREFIX}-owner.testnet"
  CLINIC_ID="${PREFIX}-clinic.testnet"
  HOSPITAL_ID="${PREFIX}-hospital.testnet"
  SECOND_ID="${PREFIX}-second.testnet"
  LAKESIDE_ID="${PREFIX}-lakeside.testnet"
  PULSEFIT_ID="${PREFIX}-pulsefit.testnet"
  PATIENT_ID="${PREFIX}-patient.testnet"
  cat >"$STATE" <<EOF
PREFIX=${PREFIX}
CONTRACT_ID=${CONTRACT_ID}
OWNER_ID=${OWNER_ID}
CLINIC_ID=${CLINIC_ID}
HOSPITAL_ID=${HOSPITAL_ID}
SECOND_ID=${SECOND_ID}
LAKESIDE_ID=${LAKESIDE_ID}
PULSEFIT_ID=${PULSEFIT_ID}
PATIENT_ID=${PATIENT_ID}
EOF
  chmod 600 "$STATE"
fi

for id in "$CONTRACT_ID" "$OWNER_ID" "$CLINIC_ID" "$HOSPITAL_ID" "$SECOND_ID" "$LAKESIDE_ID" "$PULSEFIT_ID" "$PATIENT_ID"; do
  if [[ "$id" != *.testnet ]]; then
    echo "Refusing a non-testnet account id." >&2
    exit 1
  fi
done

public_of() {
  jq -r .public_key "$1"
}

secret_of() {
  local value
  value="$(jq -r .private_key "$1")"
  if [[ ! "$value" =~ ^ed25519:[1-9A-HJ-NP-Za-km-z]{80,}$ ]]; then
    echo "Key file ${1} has no ed25519 secret. Nothing was printed." >&2
    exit 1
  fi
  printf '%s' "$value"
}

rate_limited() {
  grep -Eqi '429|rate.?limit|too many|try again later' "$LOG"
}

pause_for_faucet() {
  local account="$1"
  local attempt="$2"
  echo "The testnet faucet is rate limiting ${account}. Pausing 20 seconds, then trying again (${attempt} of 5). No key was printed."
  sleep 20
}

run_near() {
  if near "$@" >"$LOG" 2>&1; then
    rm -f "$LOG"
    return 0
  fi
  return 1
}

strip_key_file() {
  local src="$1"
  local dest="$2"
  local stripped
  stripped="$(mktemp "${SECRETS_DIR}/.key.XXXXXX")"
  chmod 600 "$stripped"
  if ! jq -e '{public_key, private_key} | select(.public_key != null and .private_key != null and (.public_key | type == "string") and (.private_key | type == "string"))' "$src" >"$stripped"; then
    rm -f "$stripped"
    return 1
  fi
  if jq -e 'has("master_seed_phrase") or has("seed_phrase_hd_path")' "$stripped" >/dev/null; then
    rm -f "$stripped"
    return 1
  fi
  mv "$stripped" "$dest"
  chmod 600 "$dest"
}

new_key() {
  local file="$1"
  if [[ -f "$file" ]]; then
    if ! strip_key_file "$file" "$file"; then
      echo "Saved key file could not be reduced to a public and private key. Nothing was printed." >&2
      exit 1
    fi
    return 0
  fi
  local tmpdir src count
  tmpdir="$(mktemp -d)"
  chmod 700 "$tmpdir"
  if ! near account create-account fund-later use-auto-generation save-to-folder "$tmpdir" >"$LOG" 2>&1; then
    rm -f "$LOG"
    rm -rf "$tmpdir"
    echo "Key generation failed. Nothing was printed." >&2
    exit 1
  fi
  rm -f "$LOG"
  count="$(find "$tmpdir" -type f -name '*.json' | wc -l | tr -d ' ')"
  if [[ "$count" -ne 1 ]]; then
    rm -rf "$tmpdir"
    echo "Key generation did not write one key file. Nothing was printed." >&2
    exit 1
  fi
  src="$(find "$tmpdir" -type f -name '*.json')"
  if ! strip_key_file "$src" "$file"; then
    rm -rf "$tmpdir"
    echo "Key generation did not produce a usable key. Nothing was printed." >&2
    exit 1
  fi
  rm -rf "$tmpdir"
}

view_lines() {
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
  printf '%s\n' "$out"
}

account_code() {
  view_lines code "$1"
}

key_lines() {
  local id="$1"
  local status
  status="$(view_lines keys "$id")" || return 1
  printf '%s\n' "$status"
}

create_with_faucet() {
  local account="$1"
  local pub="$2"
  local attempt
  for attempt in 1 2 3 4 5; do
    if [[ "$(account_code "$account")" != "missing" ]]; then
      return 0
    fi
    if run_near account create-account sponsor-by-faucet-service "$account" \
      use-manually-provided-public-key "$pub" \
      network-config testnet create; then
      return 0
    fi
    if rate_limited; then
      pause_for_faucet "$account" "$attempt"
      continue
    fi
    echo "Account creation failed for ${account}. The log is mode 600 at ${LOG}. Do not paste it." >&2
    exit 1
  done
  echo "The testnet faucet kept rate limiting ${account}. Wait, then run this script again with SECRETS_DIR=${SECRETS_DIR}." >&2
  exit 1
}

copy_legacy_keychain() {
  local account="$1"
  local file="$2"
  local also_account_file="$3"
  local pub
  pub="$(public_of "$file")"
  local root="${HOME}/.near-credentials/testnet"
  local key_file="${root}/${account}/$(printf '%s' "$pub" | tr ':' '_').json"
  mkdir -p "${root}/${account}"
  cp "$file" "$key_file"
  chmod 600 "$key_file"
  if [[ "$also_account_file" == "yes" ]]; then
    cp "$file" "${root}/${account}.json"
    chmod 600 "${root}/${account}.json"
  fi
}

has_full_key() {
  local account="$1"
  local pub="$2"
  local lines
  lines="$(key_lines "$account")"
  if [[ "$lines" == "missing" ]]; then
    return 1
  fi
  printf '%s\n' "$lines" | awk -F '\t' -v pub="$pub" '$1 == pub && $2 == "FullAccess" { found = 1 } END { exit found ? 0 : 1 }'
}

create_account() {
  local label="$1"
  local account="$2"
  local file="$SECRETS_DIR/keys/${label}-full.json"
  new_key "$file"
  local pub
  pub="$(public_of "$file")"
  local code
  code="$(account_code "$account")"
  if [[ "$code" == "missing" ]]; then
    create_with_faucet "$account" "$pub"
  elif has_full_key "$account" "$pub"; then
    echo "${label} ${account} already exists with the saved full-access key"
  else
    echo "${account} exists, but the saved full-access key is not on it. Stop. No key was printed." >&2
    exit 1
  fi
  copy_legacy_keychain "$account" "$file" yes
  printf '%s %s\n' "$label" "$account"
  printf 'full public key %s\n' "$pub"
}

function_key_state() {
  local account="$1"
  local pub="$2"
  local methods="$3"
  local lines sorted
  lines="$(key_lines "$account")"
  if [[ "$lines" == "missing" ]]; then
    printf '%s' "missing"
    return
  fi
  sorted="$(printf '%s' "$methods" | tr ',' '\n' | sort | paste -sd, -)"
  printf '%s\n' "$lines" | awk -F '\t' -v pub="$pub" -v contract="$CONTRACT_ID" -v methods="$sorted" '
    $1 == pub {
      if ($2 == contract && $3 == methods) print "yes"
      else print "mismatch"
      found = 1
    }
    END { if (!found) print "no" }
  '
}

add_function_key() {
  local label="$1"
  local account="$2"
  local role="$3"
  local file="$SECRETS_DIR/keys/${label}-fc.json"
  local full="$SECRETS_DIR/keys/${label}-full.json"
  local methods state pub attempt
  methods="$(methods_for "$role")"
  new_key "$file"
  pub="$(public_of "$file")"
  state="$(function_key_state "$account" "$pub" "$methods")"
  if [[ "$state" == "yes" ]]; then
    echo "function-call key already on ${account}"
  elif [[ "$state" == "mismatch" ]]; then
    echo "A different function-call key is already saved for ${account}. Stop. No key was printed." >&2
    exit 1
  else
    local added=0
    for attempt in 1 2 3 4 5; do
      if run_near account add-key "$account" \
        grant-function-call-access \
        --allowance '1 NEAR' \
        --contract-account-id "$CONTRACT_ID" \
        --function-names "$methods" \
        use-manually-provided-public-key "$pub" \
        network-config testnet \
        sign-with-access-key-file "$full" \
        send; then
        added=1
        break
      fi
      if rate_limited; then
        pause_for_faucet "$account" "$attempt"
        continue
      fi
      echo "Adding the function-call key failed for ${account}. The log is mode 600 at ${LOG}. Do not paste it." >&2
      exit 1
    done
    if [[ "$added" -ne 1 ]]; then
      echo "The NEAR RPC kept rate limiting the key add for ${account}. Wait, then run this script again with SECRETS_DIR=${SECRETS_DIR}." >&2
      exit 1
    fi
  fi
  copy_legacy_keychain "$account" "$file" no
  printf 'function-call public key %s\n' "$pub"
  printf 'function-call methods %s\n' "$methods"
}

echo "Secrets directory ${SECRETS_DIR}"
create_account contract "$CONTRACT_ID"
create_account owner "$OWNER_ID"
create_account clinic "$CLINIC_ID"
create_account hospital "$HOSPITAL_ID"
create_account second "$SECOND_ID"
create_account lakeside "$LAKESIDE_ID"
create_account pulsefit "$PULSEFIT_ID"
create_account patient "$PATIENT_ID"

add_function_key clinic "$CLINIC_ID" clinic
add_function_key hospital "$HOSPITAL_ID" hospital
add_function_key second "$SECOND_ID" second
add_function_key lakeside "$LAKESIDE_ID" clinic
add_function_key pulsefit "$PULSEFIT_ID" app
add_function_key patient "$PATIENT_ID" patient

if [[ -f "$VERCEL_ENV" ]] && grep -q '^DEMO_ENC_SEED=' "$VERCEL_ENV"; then
  seed_line="$(grep '^DEMO_ENC_SEED=' "$VERCEL_ENV" | head -1)"
else
  seed_line="DEMO_ENC_SEED=$(openssl rand -hex 32)"
fi

{
  printf '%s\n' "$seed_line"
  printf 'RELAY_CONTRACT_ID=%s\n' "$CONTRACT_ID"
  printf 'RELAY_OWNER_PRIVATE_KEY=%s\n' "$(secret_of "$SECRETS_DIR/keys/owner-full.json")"
  printf 'CLINIC_A_ACCOUNT_ID=%s\n' "$CLINIC_ID"
  printf 'CLINIC_A_FULL_PRIVATE_KEY=%s\n' "$(secret_of "$SECRETS_DIR/keys/clinic-full.json")"
  printf 'CLINIC_A_FC_PRIVATE_KEY=%s\n' "$(secret_of "$SECRETS_DIR/keys/clinic-fc.json")"
  printf 'HOSPITAL_B_ACCOUNT_ID=%s\n' "$HOSPITAL_ID"
  printf 'HOSPITAL_B_FULL_PRIVATE_KEY=%s\n' "$(secret_of "$SECRETS_DIR/keys/hospital-full.json")"
  printf 'HOSPITAL_B_FC_PRIVATE_KEY=%s\n' "$(secret_of "$SECRETS_DIR/keys/hospital-fc.json")"
  printf 'SECOND_OPINION_ACCOUNT_ID=%s\n' "$SECOND_ID"
  printf 'SECOND_OPINION_FULL_PRIVATE_KEY=%s\n' "$(secret_of "$SECRETS_DIR/keys/second-full.json")"
  printf 'SECOND_OPINION_FC_PRIVATE_KEY=%s\n' "$(secret_of "$SECRETS_DIR/keys/second-fc.json")"
  printf 'LAKESIDE_ACCOUNT_ID=%s\n' "$LAKESIDE_ID"
  printf 'LAKESIDE_FULL_PRIVATE_KEY=%s\n' "$(secret_of "$SECRETS_DIR/keys/lakeside-full.json")"
  printf 'LAKESIDE_FC_PRIVATE_KEY=%s\n' "$(secret_of "$SECRETS_DIR/keys/lakeside-fc.json")"
  printf 'PULSEFIT_ACCOUNT_ID=%s\n' "$PULSEFIT_ID"
  printf 'PULSEFIT_FULL_PRIVATE_KEY=%s\n' "$(secret_of "$SECRETS_DIR/keys/pulsefit-full.json")"
  printf 'PULSEFIT_FC_PRIVATE_KEY=%s\n' "$(secret_of "$SECRETS_DIR/keys/pulsefit-fc.json")"
  printf 'DEMO_PATIENT_ACCOUNT_ID=%s\n' "$PATIENT_ID"
  printf 'DEMO_PATIENT_PRIVATE_KEY=%s\n' "$(secret_of "$SECRETS_DIR/keys/patient-full.json")"
} >"$VERCEL_ENV"
chmod 600 "$VERCEL_ENV"
unset seed_line

{
  printf 'CONTRACT_ACCOUNT_ID=%s\n' "$CONTRACT_ID"
  printf 'OWNER_ACCOUNT_ID=%s\n' "$OWNER_ID"
  printf 'CLINIC_ACCOUNT_ID=%s\n' "$CLINIC_ID"
  printf 'HOSPITAL_ACCOUNT_ID=%s\n' "$HOSPITAL_ID"
  printf 'SECOND_ACCOUNT_ID=%s\n' "$SECOND_ID"
  printf 'LAKESIDE_ACCOUNT_ID=%s\n' "$LAKESIDE_ID"
  printf 'PULSEFIT_ACCOUNT_ID=%s\n' "$PULSEFIT_ID"
  printf 'PATIENT_ACCOUNT_ID=%s\n' "$PATIENT_ID"
} >"$PUBLIC_ENV"

for pair in \
  "CLINIC_ENC_PUBKEY $CLINIC_ID" \
  "HOSPITAL_ENC_PUBKEY $HOSPITAL_ID" \
  "SECOND_ENC_PUBKEY $SECOND_ID" \
  "LAKESIDE_ENC_PUBKEY $LAKESIDE_ID" \
  "PULSEFIT_ENC_PUBKEY $PULSEFIT_ID" \
  "PATIENT_ENC_PUBKEY $PATIENT_ID"
do
  name="${pair%% *}"
  account="${pair#* }"
  hex="$(node "$KIT/enc-public.mjs" "$VERCEL_ENV" "$account")"
  if [[ ! "$hex" =~ ^[0-9a-f]{64}$ ]]; then
    echo "Encryption public key for ${account} was not 64 hex characters." >&2
    exit 1
  fi
  printf '%s=%s\n' "$name" "$hex" >>"$PUBLIC_ENV"
  printf 'enc public %s %s\n' "$account" "$hex"
done
chmod 600 "$PUBLIC_ENV"

echo "Private keys are in ${VERCEL_ENV} (mode 600). Do not print that file."
echo "Account ids and encryption public keys are in ${PUBLIC_ENV}."
echo "Next: SECRETS_DIR=${SECRETS_DIR} ${KIT}/deploy.sh"
echo "Patient consent methods attach 1 yoctoNEAR, so DEMO_PATIENT_PRIVATE_KEY is the full-access key."
