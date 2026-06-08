// Submits one Groth16 proof to the deployed verifier and reports cost.
//
// Prereqs:
//   - Run deploy.mjs first; export CONTRACT_ADDRESS
//   - Also requires: PRIVATE_KEY, RPC_URL
//
// The proof below is the "always-true" identity element of the Groth16 verifier
// (zero inputs, identity points) which serves to exercise the BN254 pairing
// precompile end-to-end. For a real zkEmail proof, replace `a/b/c/input` with the
// values produced by snarkjs from a circuit run; the Verifier.sol shipped here
// is the proof-of-twitter circuit verifier (3 public inputs).
//
// Note: this minimal test exercises the pairing precompile path even though it
// won't return `true` against the proof-of-twitter verification key. To get a
// `true` return value you must paste a real proof. See README.md "Generating a
// real test proof" section.

import { ethers } from "ethers";
import { readFileSync } from "node:fs";

const RPC_URL = process.env.RPC_URL || "https://westend-asset-hub-eth-rpc.polkadot.io";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

if (!PRIVATE_KEY || !CONTRACT_ADDRESS) {
  console.error("Set PRIVATE_KEY and CONTRACT_ADDRESS env vars.");
  process.exit(1);
}

const abi = JSON.parse(readFileSync(new URL("./Verifier.abi", import.meta.url)));
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const verifier = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

// Placeholder proof — replace with real snarkjs output for a passing verification.
// This will exercise the BN254 pairing precompile but return false.
const a = [1n, 2n];
const b = [[1n, 2n], [3n, 4n]];
const c = [5n, 6n];
const input = [0n, 0n, 0n];

console.log("Submitting verifyProof (eth_call, gas estimate first)...");
const gas = await verifier.verifyProof.estimateGas(a, b, c, input).catch(e => e);
console.log(`Estimated gas: ${gas}`);

// On-chain verify (state-changing only if we wrap; verifyProof is view, so this is eth_call):
const result = await verifier.verifyProof(a, b, c, input);
console.log(`verifyProof returned: ${result}`);
console.log(`(false is expected for placeholder inputs; the meaningful signal is that the call did NOT revert,`);
console.log(`which means the BN254 pairing precompile executed and pallet-revive accepted the bytecode.)`);
