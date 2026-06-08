// Diagnoses Westend Asset Hub / pallet-revive RPC state before deployment.
// Run: node diagnose.mjs
// This never sends a real transaction; it only does eth_call + read-only queries.

import { ethers } from "ethers";
import { readFileSync } from "node:fs";

const RPC_URL = process.env.RPC_URL || "https://westend-asset-hub-eth-rpc.polkadot.io";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("Set PRIVATE_KEY env var.");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const bytecode = "0x" + readFileSync(new URL("./Verifier.pvm", import.meta.url)).toString("hex");

console.log("=== Account state ===");
const network  = await provider.getNetwork();
const balance  = await provider.getBalance(wallet.address);
const nonce    = await provider.getTransactionCount(wallet.address);
const feeData  = await provider.getFeeData();

console.log(`Chain ID:      ${network.chainId}`);
console.log(`Address:       ${wallet.address}`);
console.log(`Balance:       ${ethers.formatEther(balance)} (native)`);
console.log(`Nonce:         ${nonce}`);
console.log(`gasPrice:      ${ethers.formatUnits(feeData.gasPrice ?? 0n, "gwei")} gwei`);
console.log(`maxFeePerGas:  ${ethers.formatUnits(feeData.maxFeePerGas ?? 0n, "gwei")} gwei`);
console.log(`Bytecode size: ${bytecode.length / 2 - 1} bytes`);

console.log("\n=== eth_call dry-run (no state change) ===");
try {
  const result = await provider.call({
    from: wallet.address,
    data: bytecode,
    gasLimit: 500_000n,
    gasPrice: feeData.gasPrice ?? ethers.parseUnits("1", "gwei"),
    type: 0,
  });
  console.log(`eth_call result: ${result} (empty = OK for constructor)`);
} catch (e) {
  console.log(`eth_call error: ${e.message}`);
  if (e.data) console.log(`  revert data: ${e.data}`);
  if (e.error) console.log(`  inner: ${JSON.stringify(e.error)}`);
}

console.log("\n=== Gas estimate attempt ===");
try {
  const gas = await provider.estimateGas({
    from: wallet.address,
    data: bytecode,
  });
  console.log(`estimateGas: ${gas.toString()}`);
} catch (e) {
  console.log(`estimateGas error: ${e.message}`);
  if (e.error) console.log(`  inner: ${JSON.stringify(e.error)}`);
}

console.log("\n=== Raw RPC probe ===");
try {
  const raw = await provider.send("eth_getCode", [wallet.address, "latest"]);
  console.log(`eth_getCode(deployer): ${raw}`);
} catch (e) {
  console.log(`eth_getCode error: ${e.message}`);
}
