# Real zkEmail circuit build pipeline

This directory holds the source + recipe for the real zkEmail-derived
EmailVerifier circuit deployed by zkAttest. The compiled artifacts are larger
than git's per-file limit and are shipped via Cloudflare R2 (see `HOSTING.md`)
and `spike/` for the on-chain verifier bytecode.

## What's in this directory

| File | Size | Description |
|---|---|---|
| `zkattest_email.circom` | 2 KB | Thin wrapper around `@zk-email/circuits/email-verifier.circom` with our chosen parameters |
| `test-proof.mjs` | 6 KB | End-to-end self-test: generates RSA-2048 keypair, signs a header, builds inputs, runs `snarkjs.groth16.fullProve`, verifies locally |
| `Verifier.sol` | 8 KB | Solidity verifier exported by snarkjs |
| `Verifier.pvm` | 12 KB | PVM bytecode (resolc-compiled from Verifier.sol) for `pallet-revive` |
| `verification_key.json` | 3 KB | Groth16 vkey |
| `package.json` | — | `@zk-email/circuits` + `snarkjs` deps |

The circuit's chosen parameters (`maxHeadersLength=256`, `maxBodyLength=64`,
`ignoreBodyHashCheck=1`, no masking) keep the constraint count at ~315k. This
is the minimal viable real-zkEmail circuit; production setups bump
`maxHeadersLength` to 1024+ and enable body verification.

## Rebuild from scratch

Requires: `circom 2.x`, `snarkjs`, `resolc`, `solc`, ~5 GB free disk. A local run was observed at roughly 15 minutes.

```bash
cd real-circuit
npm install

# 1. Compile circuit → r1cs + wasm
circom zkattest_email.circom --r1cs --wasm --sym -l node_modules -p bn128
# Output: zkattest_email.r1cs (~70 MB), zkattest_email_js/zkattest_email.wasm (~4 MB)
# Sanity: npx snarkjs r1cs info zkattest_email.r1cs
#         (should report ~315k non-linear constraints, ~14k linear, 3 public outputs)

# 2. Download Powers of Tau (~600 MB, one-time)
curl -L -o pot19.ptau https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_19.ptau

# 3. Groth16 setup (~5 min) → initial.zkey
npx snarkjs groth16 setup zkattest_email.r1cs pot19.ptau initial.zkey

# 4. Contribute randomness → final.zkey (~182 MB)
echo "your-entropy-here" | npx snarkjs zkey contribute initial.zkey final.zkey --name="contributor"

# 5. Export vkey + Solidity verifier
npx snarkjs zkey export verificationkey final.zkey verification_key.json
npx snarkjs zkey export solidityverifier final.zkey Verifier.sol

# 6. Compile Verifier.sol → Verifier.pvm
resolc --bin -O3 --evm-version cancun Verifier.sol \
  | awk '/^Binary:$/{getline; print}' \
  | node -e "process.stdin.on('data', d => process.stdout.write(Buffer.from(d.toString().trim(), 'hex')))" > Verifier.pvm
solc --abi Verifier.sol 2>/dev/null | sed -n '4p' > Verifier.abi

# 7. Self-test
node test-proof.mjs
# Expected: "Local verify: OK ✓" (observed locally around 15 s)
```

## Deploy + R2 upload

After rebuild, copy the artifacts into `spike/`:

```bash
cp Verifier.{sol,pvm,abi} verification_key.json ../spike/
cp zkattest_email_js/zkattest_email.wasm ../spike/circuit.wasm
cp final.zkey ../spike/circuit_final.zkey
```

Then redeploy and upload (see `HOSTING.md` for R2 steps, and `spike/README.md`
for deploy steps).
