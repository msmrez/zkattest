# Spike 01 — Groth16 verifier on Polkadot Asset Hub

**Status:** historical Spike 01. Local compilation was verified here; the live mainnet verifier deployment and real-proof verification now live in the root `README.md`.

## What this spike proves

That zkEmail's standard snarkjs-generated Groth16 verifier (the Christian
Reitwiessner template, used by `proof-of-twitter` and every other Circom-based
zkEmail app) compiles cleanly to PolkaVM bytecode via Parity's `resolc`
compiler — with no source modifications, on the first try.

This was the first technical de-risking pass for the zkAttest project. The
later real zkEmail-derived verifier deployment on Polkadot Asset Hub supersedes
the deployment TODOs below; this file remains as the compile-spike record.

## Empirical results

| Step | Result |
|---|---|
| `resolc` toolchain installs | ✅ 1.1.0+commit.f887e75 |
| Standard `solc` 0.8.30 | ✅ Supported (resolc accepts 0.8.0–0.8.34) |
| `Verifier.sol` (proof-of-twitter, 265 lines) | ✅ Compiles unchanged |
| Output bytecode | ✅ Valid PolkaVM (`PVM\0` magic) |
| `Verifier.pvm` size | 29,255 bytes |
| `Pairing.pvm` size | 890 bytes (library — inlined at use sites) |
| ABI matches Ethereum reference | ✅ `verifyProof(uint256[2], uint256[2][2], uint256[2], uint256[3]) → bool` |

## Historical limitation at the time of this spike

At the time, this spike did not prove the live deployment path or a transaction
that exercised the BN254 precompile. That has since been covered by the root
README's live mainnet artifacts.

## Reproduction (local compile — already confirmed working)

```bash
# 1. Install resolc
curl -L -o /usr/local/bin/resolc \
  https://github.com/paritytech/revive/releases/latest/download/resolc-x86_64-unknown-linux-musl
chmod +x /usr/local/bin/resolc

# 2. Install solc 0.8.30 (in resolc's supported range)
curl -L -o /usr/local/bin/solc \
  https://github.com/ethereum/solidity/releases/download/v0.8.30/solc-static-linux
chmod +x /usr/local/bin/solc

# 3. Compile (from this directory)
resolc --bin --output-dir ./build --overwrite Verifier.sol
solc --abi Verifier.sol -o build --overwrite  # ABI not yet emitted by resolc 1.1
```

## Historical testnet deployment notes

```bash
# 1. Get testnet WND from the Westend faucet:
#    https://faucet.polkadot.io/westend  (select Asset Hub, paste your EVM address)

# 2. Install deploy deps
cd spike
npm init -y
npm install ethers@6

# 3. Set credentials and deploy
export PRIVATE_KEY=0x...your_testnet_key...
export RPC_URL=https://westend-asset-hub-eth-rpc.polkadot.io
node deploy.mjs

# 4. Submit a test call (exercises the pairing precompile)
export CONTRACT_ADDRESS=0x...output_from_step_3...
node verify.mjs
```

Expected output of `verify.mjs`: the call does NOT revert and returns `false`
(placeholder inputs). The meaningful signal is non-revert, which means the
BN254 precompile executed inside pallet-revive.

## Generating a real (passing) test proof

The placeholder in `verify.mjs` returns `false`. To get a `true` result you
need a real proof against the proof-of-twitter circuit's verification key:

```bash
# In a separate scratch dir
git clone https://github.com/zkemail/proof-of-twitter
cd proof-of-twitter/packages/circuits
yarn && yarn build
# Then snarkjs prove using the included sample input; the resulting
# proof.json + public.json plug directly into verify.mjs.
```

This is not required to validate the spike — non-revert + correct return type
is sufficient evidence that the verifier runs. The "real passing proof"
exercise was later covered by Spike 02; see the root README for the current
mainnet proof-verification artifact.

## What this unlocks

At the time, this supported the grant-facing claim, with reproduction
instructions: "a standard snarkjs-generated Groth16 verifier deploys to Asset
Hub with no Solidity modifications, via the standard Parity toolchain."
That single empirical claim is the difference between a speculative grant
proposal and a credible one.

## Historical next-spike plan

- **Spike 02:** generate a real zkEmail proof, submit to deployed verifier,
  measure actual gas cost vs the $0.017/verify W3F study claim.
- **Spike 03:** wrap the verifier in a minimal Solidity facade that adds the
  nullifier check and a `PersonalId` mapping (precursor to the FRAME pallet).
- **Spike 04:** port the same flow to a local pallet-revive dev node
  (`substrate-contracts-node` or `polkadot-omni-node` with revive pallet)
  for hermetic CI testing.
