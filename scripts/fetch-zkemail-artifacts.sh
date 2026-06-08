#!/usr/bin/env bash
# Builds (or guides building) zkEmail's EmailVerifier Circom circuit artifacts.
#
# Unlike pure ZK projects with public ceremony outputs, zkEmail does NOT publish
# prebuilt circuit artifacts — every project compiles them from circom source.
# This is intentional: the EmailVerifier circuit has many parameters
# (maxHeadersLength, maxBodyLength, etc.) that downstream projects tune.
#
# Building from source requires (~3–8 hours, multi-GB downloads):
#   1. circom 2 compiler                  (https://docs.circom.io/getting-started/installation/)
#   2. snarkjs                            npm i -g snarkjs
#   3. Powers of Tau file (~2 GB)         from hermez ceremony, or generate locally
#   4. Compile EmailVerifier.circom       circom -p bn128 --r1cs --wasm --sym
#   5. Phase 2 setup                      snarkjs groth16 setup r1cs ptau zkey
#   6. Chunked zkey for browser           via the proof-of-twitter chunked-zkey fork
#
# Until that pipeline exists in this repo, use scripts/upload-toy-to-r2.sh
# to put the toy Multiplier(1000) circuit (already in web/circuit/) on R2.
# That proves the entire R2 → website fetch path is real.
#
# References:
#   - https://github.com/zkemail/zk-email-verify
#   - https://github.com/zkemail/proof-of-twitter (their reference build scripts)
#   - https://docs.zk.email

set -euo pipefail
echo "This script is currently a stub. Use scripts/upload-toy-to-r2.sh for now."
echo "Building real zkEmail artifacts is tracked in the roadmap (Spike 02)."
exit 1
