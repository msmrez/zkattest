#!/usr/bin/env bash
# Uploads the toy Multiplier(1000) circuit artifacts already in web/circuit/
# to Cloudflare R2 under the email_ownership/ prefix (matching the website's
# ZKEMAIL_BASE_URL config).
#
# This is the immediate "R2 is real" path. The real zkEmail Circom circuit
# (EmailVerifier, ~3 GB chunked .zkey) is a separate spike that requires
# building artifacts from source with circom + Powers of Tau. See
# scripts/build-zkemail-artifacts.sh (TODO) for that pipeline.
#
# Prereqs:
#   1. `aws` CLI installed (brew install awscli)
#   2. R2 bucket exists with public access enabled
#   3. R2 API token created (read+write on the bucket)
#
# Env vars (required):
#   R2_ACCOUNT_ID         e.g. 7b4c7b24cd77f3956eaf6d0185fe459a
#   R2_ACCESS_KEY_ID      from R2 API token
#   R2_SECRET_ACCESS_KEY  from R2 API token
#   R2_BUCKET             e.g. zkp-storage
#
# Optional:
#   R2_PREFIX             default: email_ownership

set -euo pipefail
cd "$(dirname "$0")/.."

: "${R2_ACCOUNT_ID:?Set R2_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?Set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?Set R2_SECRET_ACCESS_KEY}"
: "${R2_BUCKET:?Set R2_BUCKET}"
R2_PREFIX="${R2_PREFIX:-email_ownership}"

SRC=web/circuit
for f in verification_key.json circuit.wasm circuit_final.zkey; do
  if [[ ! -f "$SRC/$f" ]]; then
    echo "Missing $SRC/$f — toy circuit artifacts should be in $SRC/."
    exit 1
  fi
done

ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto

upload() {
  local local_path="$1" key="$2" ctype="$3"
  echo "→ s3://$R2_BUCKET/$key ($(wc -c <"$local_path") bytes)"
  aws s3 cp "$local_path" "s3://$R2_BUCKET/$key" \
    --endpoint-url "$ENDPOINT" \
    --content-type "$ctype" \
    --cache-control "public, max-age=31536000, immutable"
}

upload "$SRC/verification_key.json" "$R2_PREFIX/verification_key.json" "application/json"
upload "$SRC/circuit.wasm"          "$R2_PREFIX/circuit.wasm"          "application/wasm"
upload "$SRC/circuit_final.zkey"    "$R2_PREFIX/circuit_final.zkey"    "application/octet-stream"

echo
echo "Done. Verify with:"
echo "  curl -I https://pub-a34a2db2f64d4ca1b7914c0cfe6652fc.r2.dev/$R2_PREFIX/verification_key.json"
echo
echo "If the website still shows 'R2 pending', hard-reload to bust the cache."
