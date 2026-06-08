// Deploys Verifier.pvm via native Substrate API (pallet-revive.instantiateWithCode).
// Bypasses the eth-rpc, which rejects H160 accounts funded via SS58 (code 1010).
//
// Prereqs (one-time):
//   cd spike && npm install @polkadot/api
//
// Usage — two modes:
//
//   A) Polkadot MAINNET — use your main wallet's 12/24-word mnemonic:
//      export MNEMONIC="word word word ..."
//      node deploy-substrate.mjs
//      Needs ~0.01–0.1 DOT for gas + storage deposit (you have 7.5 DOT, plenty).
//
//   B) Paseo TESTNET — same runtime, free tokens:
//      export MNEMONIC="word word word ..."
//      export WS_URL=wss://pas-rpc.stakeworld.io/assethub    # or another Paseo AH RPC
//      node deploy-substrate.mjs
//      Get free PAS from: https://faucet.polkadot.io/?parachain=1000 (select Paseo)
//
//   C) secp256k1 key (from generate-deployer.mjs) — ecdsa signing:
//      export PRIVATE_KEY=0x...
//      node deploy-substrate.mjs
//
//   Default WS_URL: wss://polkadot-asset-hub-rpc.polkadot.io (mainnet)
//
// Output: contract H160 address + block hash
// Paste into web/index.html: CONTRACT_ADDR and DEPLOY_TX.

import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { hexToU8a, u8aToHex } from "@polkadot/util";
import { encodeAddress } from "@polkadot/keyring";
import { readFileSync } from "node:fs";

const WS_URL     = process.env.WS_URL     || "wss://polkadot-asset-hub-rpc.polkadot.io";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MNEMONIC    = process.env.MNEMONIC;

if (!PRIVATE_KEY && !MNEMONIC) {
  console.error("Set either PRIVATE_KEY (secp256k1) or MNEMONIC (sr25519) env var.");
  process.exit(1);
}

const code = readFileSync(new URL("./Verifier.pvm", import.meta.url));
console.log(`Bytecode size: ${code.length} bytes`);

console.log(`Connecting to ${WS_URL} …`);
const wsProvider = new WsProvider(WS_URL);
const api = await ApiPromise.create({ provider: wsProvider });
await api.isReady;
const chain = await api.rpc.system.chain();
console.log(`Chain:   ${chain}`);

let account;
let displayAddress; // H160 or SS58 depending on key type

if (PRIVATE_KEY) {
  // secp256k1 key: use 'ecdsa' type — signs Substrate extrinsics with raw secp256k1.
  // The account address is blake2_256(compressedPubkey), NOT the H160.
  // Fund THIS address from the faucet, NOT the H160 address.
  const keyring = new Keyring({ type: "ecdsa" });
  account = keyring.addFromUri(PRIVATE_KEY);
  displayAddress = account.address;
} else {
  // sr25519 mnemonic — standard Substrate signing
  const keyring = new Keyring({ type: "sr25519", ss58Format: 42 });
  account = keyring.addFromUri(MNEMONIC);
  displayAddress = account.address;
}

console.log(`Deployer SS58:   ${displayAddress}`);

// For ecdsa key: also print the H160 so user knows which is which
if (PRIVATE_KEY) {
  // Derive H160 from secp256k1 public key (keccak256 of uncompressed pubkey, last 20 bytes)
  // @polkadot/keyring ecdsa: publicKey is compressed 33 bytes
  console.log(`Deployer pubkey: ${u8aToHex(account.publicKey)}`);
  console.log(`(Note: ecdsa SS58 address differs from H160 — fund the SS58 address above)`);
}

const { data: { free } } = await api.query.system.account(account.address);
console.log(`Balance: ${free.toHuman()}`);

if (free.isZero()) {
  console.error("\nAccount has no balance! Get free WND at:");
  console.error(`  https://faucet.polkadot.io/?parachain=1000`);
  console.error(`  Paste your SS58 address above and select Westend Asset Hub`);
  await api.disconnect();
  process.exit(1);
}

// pallet-revive.instantiateWithCode params:
//   value               — native tokens to send to contract on deploy (0)
//   gasLimit            — Substrate Weight { refTime, proofSize }
//   storageDepositLimit — BalanceOf<T> (compact), NOT Option — pass explicit max
//                         null encodes as 0 (= fail if any storage needed)
// Use a very large value (100_000_000_000_000 planck = 10,000 DOT) to act as no-limit
//   code                — raw PVM bytecode (hex)
//   data                — ABI-encoded constructor args (empty = no-arg constructor)
//   salt                — Option<[u8;32]>, null = no salt
// Helper: sign-and-send a tx, resolve when InBlock (or reject on dispatch error)
function sendAndWait(tx, label) {
  return new Promise((resolve, reject) => {
    let unsub;
    tx.signAndSend(account, (result) => {
      const { status, events, dispatchError } = result;
      console.log(`  [${label}] Status: ${status.type}`);

      if (dispatchError) {
        let msg = dispatchError.toString();
        if (dispatchError.isModule) {
          try {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            msg = `${decoded.section}.${decoded.name}: ${decoded.docs.join(" ")}`;
          } catch (_) {}
        }
        unsub?.();
        reject(new Error(`Dispatch error: ${msg}`));
        return;
      }

      if (status.isInBlock || status.isFinalized) {
        unsub?.();
        resolve({ status, events });
      }
    }).then(u => { unsub = u; }).catch(reject);
  });
}

// Step 1: map_account — required once per AccountId32 before using pallet-revive.
// If already mapped this will error; we catch and continue.
console.log("Step 1: revive.mapAccount (required once per account) …");
try {
  await sendAndWait(api.tx.revive.mapAccount(), "mapAccount");
  console.log("  mapAccount: OK ✓");
} catch (e) {
  if (e.message.includes("DuplicateMapping") || e.message.includes("AlreadyMapped")) {
    console.log("  mapAccount: already mapped, continuing …");
  } else {
    // Some chains surface this differently — log but don't abort
    console.log(`  mapAccount: ${e.message} — continuing anyway …`);
  }
}

// Step 2: deploy the contract
const tx = api.tx.revive.instantiateWithCode(
  0,
  { refTime: 30_000_000_000n, proofSize: 262_144n },
  100_000_000_000_000n,                                 // storageDepositLimit: u128 max-ish, no practical limit
  u8aToHex(code),
  "0x",
  null,
);

console.log("\nStep 2: deploying via pallet-revive.instantiateWithCode …");

const { status, events } = await sendAndWait(tx, "deploy");
const blockHash = (status.isInBlock ? status.asInBlock : status.asFinalized).toHex();
console.log(`  Block hash: ${blockHash}`);

let contractAddr = null;
for (const { event } of events) {
  // revive.Instantiated(deployer: H160, contract: H160)
  if (api.events.revive?.Instantiated?.is(event)) {
    const [deployer, contract] = event.data;
    contractAddr = contract.toString();
    console.log(`\nDeployer (H160): ${deployer}`);
    console.log(`Contract (H160): ${contractAddr}`);
  }
  if (api.events.system.ExtrinsicSuccess?.is(event)) {
    console.log("Status: OK ✓");
  }
  if (api.events.system.ExtrinsicFailed?.is(event)) {
    console.log("Status: FAILED");
  }
}

console.log(`\n─────────────────────────────────────────`);
console.log(`Paste these into web/index.html:`);
console.log(`  const CONTRACT_ADDR = "${contractAddr ?? '(check events above)'}";`);
console.log(`  const DEPLOY_TX     = "${blockHash}";`);
console.log(`─────────────────────────────────────────`);

await api.disconnect();
