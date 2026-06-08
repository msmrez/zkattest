#!/usr/bin/env bash
# Uploads zkEmail circuit artifacts (./artifacts/zkemail/) to Cloudflare R2.
# Uses the official AWS CLI against R2's S3-compatible endpoint — no extra deps.
#
# Prereqs (one-time):
#   1. `aws` CLI installed (brew install awscli)
#   2. Cloudflare R2 bucket created with public access enabled
#   3. R2 API token created (R2 → Manage R2 API Tokens)
#   4. ./scripts/fetch-zkemail-artifacts.sh has been run
#
# Env vars (required):
#   R2_ACCOUNT_ID         Cloudflare account ID (R2 dashboard top-right)
#   R2_ACCESS_KEY_ID      from R2 API token
#   R2_SECRET_ACCESS_KEY  from R2 API token
#   R2_BUCKET             bucket name (e.g. zkattest-circuits)
#
# Optional:
#   R2_PREFIX             folder inside the bucket (default: email_ownership)
#
# Usage:
#   export R2_ACCOUNT_ID=...
#   export R2_ACCESS_KEY_ID=...
#   export R2_SECRET_ACCESS_KEY=...
#   export R2_BUCKET=zkattest-circuits
#   ./scripts/upload-to-r2.sh

set -euo pipefail
cd "$(dirname "$0")/.."

: "${R2_ACCOUNT_ID:?Set R2_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?Set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?Set R2_SECRET_ACCESS_KEY}"
: "${R2_BUCKET:?Set R2_BUCKET}"
R2_PREFIX="${R2_PREFIX:-email_ownership}"

SRC=artifacts/zkemail
for f in verification_key.json circuit.wasm circuit_final.zkey; do
  if [[ ! -f "$SRC/$f" ]]; then
    echo "Missing $SRC/$f — run ./scripts/fetch-zkemail-artifacts.sh first."
    exit 1
  fi
done

ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto

upload() {
  local local_path="$1" key="$2" ctype="$3"
  echo "Uploading $local_path → s3://$R2_BUCKET/$key ($(wc -c <"$local_path") bytes)"
  aws s3 cp "$local_path" "s3://$R2_BUCKET/$key" \
    --endpoint-url "$ENDPOINT" \
    --content-type "$ctype"
}

upload "$SRC/verification_key.json" "$R2_PREFIX/verification_key.json" "application/json"
upload "$SRC/circuit.wasm"          "$R2_PREFIX/circuit.wasm"          "application/wasm"
upload "$SRC/circuit_final.zkey"    "$R2_PREFIX/circuit_final.zkey"    "application/octet-stream"

echo
echo "Done. Public URLs (assuming public access is enabled on the bucket):"
echo "  https://pub-<your-r2-hash>.r2.dev/$R2_PREFIX/verification_key.json"
echo "  https://pub-<your-r2-hash>.r2.dev/$R2_PREFIX/circuit.wasm"
echo "  https://pub-<your-r2-hash>.r2.dev/$R2_PREFIX/circuit_final.zkey"
echo
echo "Find the exact pub-<hash> URL in R2 dashboard → bucket → Settings → Public Access."
echo "Paste it into web/index.html as ZKEMAIL_BASE_URL."
