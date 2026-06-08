// Probes eth_sendRawTransaction with escalating gasPrice values to find
// the minimum the chain accepts. Also tests type-2 (EIP-1559) vs type-0.
// Run: node test-tx.mjs

import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL || "https://westend-asset-hub-eth-rpc.polkadot.io";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) { console.error("Set PRIVATE_KEY"); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const network  = await provider.getNetwork();
const balance  = await provider.getBalance(wallet.address);
let   nonce    = await provider.getTransactionCount(wallet.address);
const feeData  = await provider.getFeeData();

console.log(`Chain:     ${network.chainId}`);
console.log(`Address:   ${wallet.address}`);
console.log(`Balance:   ${ethers.formatEther(balance)}`);
console.log(`Nonce:     ${nonce}`);
console.log(`eth_gasPrice: ${ethers.formatUnits(feeData.gasPrice ?? 0n, "gwei")} gwei`);
console.log(`maxFeePerGas: ${ethers.formatUnits(feeData.maxFeePerGas ?? 0n, "gwei")} gwei`);

const gasPricesToTry = [
  { label: "0.1 gwei (chain default)", wei: ethers.parseUnits("0.1", "gwei") },
  { label: "1 gwei",   wei: ethers.parseUnits("1",   "gwei") },
  { label: "10 gwei",  wei: ethers.parseUnits("10",  "gwei") },
  { label: "100 gwei", wei: ethers.parseUnits("100", "gwei") },
];

for (const { label, wei } of gasPricesToTry) {
  console.log(`\n── type-0, gasPrice=${label} ──`);
  try {
    const signed = await wallet.signTransaction({
      to: wallet.address,
      value: 0n,          // zero-value ping, no funds moved
      gasLimit: 21_000n,
      gasPrice: wei,
      nonce,
      chainId: network.chainId,
      type: 0,
    });
    const tx = await provider.broadcastTransaction(signed);
    console.log(`  Sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  Block: ${receipt.blockNumber}  Status: ${receipt.status === 1 ? "OK ✓" : "FAILED"}`);
    nonce++;
    break; // stop at first success
  } catch (e) {
    const code = e?.error?.code ?? e?.code ?? "?";
    console.log(`  FAILED code=${code}: ${e?.error?.message ?? e.message}`);
  }
}

// Also try EIP-1559 type-2
console.log(`\n── type-2 (EIP-1559), maxFeePerGas=10 gwei ──`);
try {
  const signed = await wallet.signTransaction({
    to: wallet.address,
    value: 0n,
    gasLimit: 21_000n,
    maxFeePerGas: ethers.parseUnits("10", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
    nonce,
    chainId: network.chainId,
    type: 2,
  });
  const tx = await provider.broadcastTransaction(signed);
  console.log(`  Sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  Block: ${receipt.blockNumber}  Status: ${receipt.status === 1 ? "OK ✓" : "FAILED"}`);
} catch (e) {
  const code = e?.error?.code ?? e?.code ?? "?";
  console.log(`  FAILED code=${code}: ${e?.error?.message ?? e.message}`);
}
