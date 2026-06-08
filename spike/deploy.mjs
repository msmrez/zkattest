// Deploys the compiled Groth16 verifier (Verifier.pvm) to Polkadot Asset Hub via
// the Ethereum-compat RPC shim (pallet-revive's `eth-rpc`).
//
// ─── IMPORTANT: This is NOT Ethereum ──────────────────────────────────────────
// ethers.js is used purely because pallet-revive exposes an Ethereum-compatible
// JSON-RPC interface. The chain, fees, and tokens are all Polkadot/DOT.
// No ETH, no Ethereum mainnet, no Ethereum gas fees.
// Fees are paid in DOT (or WND on Westend testnet) and are very small.
// ──────────────────────────────────────────────────────────────────────────────
//
// Supported targets:
//   Westend Asset Hub (testnet)  — RPC: https://westend-asset-hub-eth-rpc.polkadot.io  (chainId: 420420421)
//   Paseo  Asset Hub  (testnet)  — RPC: https://testnet-passet-hub-eth-rpc.polkadot.io  (chainId: 420420422)  ← RECOMMENDED
//   Polkadot Asset Hub (mainnet) — no public ETH RPC confirmed yet; use deploy-substrate.mjs instead
//
// Prereqs:
//   cd spike
//   npm install ethers @polkadot/keyring @polkadot/util
//   node generate-deployer.mjs           # ← prints PRIVATE_KEY + addresses to fund
//   # (then fund the address from your main 5CZm... wallet via Asset Hub)
//
//   export PRIVATE_KEY=0x...   (from generate-deployer.mjs output above)
//   export RPC_URL=<one of the URLs above, or leave blank for Westend default>
//
// Run:
//   node deploy.mjs
//
// Output:
//   - Contract address
//   - Deployment tx hash  ← paste into web/index.html and grants/bounty-36-draft.md
//   - Gas used (in PolkaVM gas units, paid in DOT)
//
// After deployment, update web/index.html:
//   const CONTRACT_ADDR = "0x...";   // line near the bottom
//   const DEPLOY_TX     = "0x...";
//
// This script intentionally does only deployment. Proof submission is in verify.mjs.

import { ethers } from "ethers";
import { readFileSync } from "node:fs";

const RPC_URL = process.env.RPC_URL || "https://testnet-passet-hub-eth-rpc.polkadot.io";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("Set PRIVATE_KEY env var to a funded testnet EOA.");
  process.exit(1);
}

const abi = JSON.parse(readFileSync(new URL("./Verifier.abi", import.meta.url)));
const bytecode = "0x" + readFileSync(new URL("./Verifier.pvm", import.meta.url)).toString("hex");

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

console.log(`Deployer:      ${wallet.address}`);
console.log(`Chain ID:      ${(await provider.getNetwork()).chainId}`);
console.log(`Balance:       ${ethers.formatEther(await provider.getBalance(wallet.address))} (native)`);
console.log(`Bytecode size: ${bytecode.length / 2 - 1} bytes`);

const factory = new ethers.ContractFactory(abi, bytecode, wallet);
console.log("Deploying...");
// pallet-revive eth-rpc quirks:
//   1. eth_estimateGas returns null → must set gasLimit explicitly
//   2. EIP-1559 (type 2) txs are rejected with code 1010 "Invalid Transaction"
//      → force legacy type-0 tx with explicit gasPrice
const gasPrice = await provider.getFeeData().then(f => f.gasPrice ?? ethers.parseUnits("1", "gwei"));
console.log(`Gas price:     ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
const contract = await factory.deploy({
  gasLimit: 500_000n,
  gasPrice,
  type: 0,
});
const tx = contract.deploymentTransaction();
console.log(`Tx hash:       ${tx.hash}`);
const receipt = await tx.wait();
console.log(`Contract:      ${await contract.getAddress()}`);
console.log(`Block:         ${receipt.blockNumber}`);
console.log(`Gas used:      ${receipt.gasUsed.toString()}`);
console.log(`Status:        ${receipt.status === 1 ? "OK" : "FAILED"}`);
