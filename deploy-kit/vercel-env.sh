#!/usr/bin/env bash
# Add each name in vercel.env to the referral-relay project.
# Set VERCEL_SCOPE to the Vercel team slug before running.
# The value is read from the file and passed on stdin. It is never a command
# argument and it is never printed.
#
# Syntax from https://vercel.com/docs/cli/env and
# https://vercel.com/docs/cli/link :
#
#   vercel link --yes --project referral-relay --scope "$VERCEL_SCOPE"
#   vercel env add NAME --environment production --sensitive --yes --force --scope "$VERCEL_SCOPE" --non-interactive < value-file
#
# The file redirect is the documented way to supply a value without a prompt.
# Piping through echo is documented and then warned against for secrets,
# because the value would land in shell history. This script does not do that.
#
# --sensitive stores a Secret. Production and Preview default to Secret.
# Development defaults to Config. Secrets are allowed in Development, so this
# script asks for a Secret there too. If the CLI refuses a Secret in
# Development, that one name is stored as Config on Development only.
#
# --force replaces an existing variable for that environment. This script does
# not call env remove. On vercel 65.16.0, env remove --yes is deprecated.
#
# Production never receives RR_SELFTEST_TOKEN.
set -euo pipefail

KIT="$(cd "$(dirname "$0")" && pwd)"
SCOPE="${VERCEL_SCOPE:-}"
PROJECT="referral-relay"
if [[ -z "$SCOPE" ]]; then
  echo "Set VERCEL_SCOPE to the Vercel team slug." >&2
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "Missing vercel. Install the Vercel CLI and run vercel login." >&2
  exit 1
fi

if [[ -z "${SECRETS_DIR:-}" && -f "${HOME}/.tendai-v2/latest" ]]; then
  SECRETS_DIR="$(cat "${HOME}/.tendai-v2/latest")"
fi
VERCEL_ENV="${VERCEL_ENV:-${SECRETS_DIR:-}/vercel.env}"
SECRETS_DIR="${SECRETS_DIR:-$(dirname "$VERCEL_ENV")}"
if [[ ! -f "$VERCEL_ENV" ]]; then
  echo "Set SECRETS_DIR to the directory provision.sh printed." >&2
  exit 1
fi
case "$VERCEL_ENV" in
  "$KIT"|"$KIT"/*)
    echo "vercel.env must stay outside the kit folder." >&2
    exit 1
    ;;
esac

echo "Linking ${PROJECT} on team ${SCOPE}."
if ! vercel link --yes --non-interactive --project "$PROJECT" --scope "$SCOPE" --cwd "$KIT" >/dev/null; then
  echo "vercel link failed. Run vercel login, then run this script again." >&2
  exit 1
fi

refused_sensitive() {
  local log="$1"
  grep -Eqi 'sensitive' "$log" && grep -Eqi 'not allowed|cannot|can.t|unsupported|refused|invalid|not supported' "$log"
}

add_one() {
  local name="$1"
  local value="$2"
  local env_name="$3"
  local sensitive="$4"
  local value_file log
  value_file="$(mktemp "${SECRETS_DIR}/.value.XXXXXX")"
  chmod 600 "$value_file"
  printf '%s' "$value" >"$value_file"
  log="$(mktemp "${SECRETS_DIR}/.vercel-log.XXXXXX")"
  chmod 600 "$log"
  local sens_flag="--sensitive"
  if [[ "$sensitive" != "yes" ]]; then
    sens_flag="--no-sensitive"
  fi
  if vercel env add "$name" --environment "$env_name" "$sens_flag" --yes --force --scope "$SCOPE" --non-interactive <"$value_file" >"$log" 2>&1; then
    rm -f "$value_file" "$log"
    echo "Set ${name} on ${env_name}."
    return 0
  fi
  if [[ "$sensitive" == "yes" && "$env_name" == "development" ]] && refused_sensitive "$log"; then
    if vercel env add "$name" --environment "$env_name" --no-sensitive --yes --force --scope "$SCOPE" --non-interactive <"$value_file" >"$log" 2>&1; then
      rm -f "$value_file" "$log"
      echo "Set ${name} on development as config. The CLI refused a secret in Development."
      return 0
    fi
  fi
  rm -f "$value_file" "$log"
  echo "Failed to set ${name} on ${env_name}. No value was printed." >&2
  return 1
}

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  name="${line%%=*}"
  value="${line#*=}"
  if [[ -z "$name" || "$name" == "$line" ]]; then
    echo "Skipping a vercel.env line that has no name." >&2
    continue
  fi
  if [[ -z "$value" ]]; then
    echo "Skipping ${name} because the value is empty." >&2
    continue
  fi
  for env_name in production preview development; do
    if [[ "$name" == "RR_SELFTEST_TOKEN" && "$env_name" == "production" ]]; then
      echo "Skipping RR_SELFTEST_TOKEN on production."
      continue
    fi
    add_one "$name" "$value" "$env_name" yes
  done
done <"$VERCEL_ENV"

echo "Vercel env update finished for ${PROJECT}. Redeploy Production and Preview so the functions read the new values."
