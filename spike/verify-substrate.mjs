// Submits a real Groth16 proof to the deployed Verifier on Polkadot Asset Hub
// mainnet via the native Substrate API (pallet-revive.call).
//
// Bypasses the eth-rpc, which rejects H160 accounts funded via SS58 (code 1010).
// Uses the same wire path as deploy-substrate.mjs.
//
// Prereqs:
//   cd spike && npm install @polkadot/api ethers snarkjs
//   node gen-proof.mjs            # writes sample-proof.json
//
// Usage:
//   export MNEMONIC="word word word ..."          # same mainnet wallet used for deploy
//   node verify-substrate.mjs                     # dry-run + submit
//   DRYRUN_ONLY=1 node verify-substrate.mjs       # only the off-chain runtime call (no tx, free)
//
// Defaults:
//   WS_URL        = wss://polkadot-asset-hub-rpc.polkadot.io
//   CONTRACT      = (must be set after redeploying Verifier.pvm — old verifier
//                    at 0x8411a1c… was built from a different circuit with 3 inputs
//                    and rejects toy-circuit proofs)
//   PROOF_FILE    = ./sample-proof.json
//
// What it does:
//   1. ABI-encodes verifyProof(a, b, c, input) → 4-byte selector + 352 bytes args
//   2. Calls api.call.reviveApi.call (dry-run, off-chain) — instant boolean result
//   3. Signs + submits api.tx.revive.call extrinsic — produces a public tx hash to cite

import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { u8aToHex, hexToU8a } from "@polkadot/util";
import { ethers } from "ethers";
import { readFileSync } from "node:fs";

const WS_URL        = process.env.WS_URL    || "wss://polkadot-asset-hub-rpc.polkadot.io";
const CONTRACT      = process.env.CONTRACT;
if (!CONTRACT) {
  console.error("Set CONTRACT=0x... (the redeployed Verifier address).");
  process.exit(1);
}
const PROOF_FILE    = process.env.PROOF_FILE|| new URL("./sample-proof.json", import.meta.url).pathname;
const MNEMONIC      = process.env.MNEMONIC;
const PRIVATE_KEY   = process.env.PRIVATE_KEY;
const DRYRUN_ONLY   = !!process.env.DRYRUN_ONLY;

if (!MNEMONIC && !PRIVATE_KEY && !DRYRUN_ONLY) {
  console.error("Set MNEMONIC or PRIVATE_KEY (or DRYRUN_ONLY=1 for the read-only path).");
  process.exit(1);
}

// ─── 1. Load + ABI-encode the proof ─────────────────────────────────────────
const sample = JSON.parse(readFileSync(PROOF_FILE, "utf8"));
const { a, b, c, publicSignals } = sample;

// Real zkEmail circuit emits 3 public signals: pubkeyHash, shaHi, shaLo.
const input = [publicSignals[0], publicSignals[1], publicSignals[2]];

// verifyProof(uint256[2], uint256[2][2], uint256[2], uint256[3]) → bool
const iface = new ethers.Interface([
  "function verifyProof(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[3] _pubSignals) view returns (bool)",
]);
const calldata = iface.encodeFunctionData("verifyProof", [a, b, c, input]);
console.log(`Calldata: ${calldata.length / 2 - 1} bytes`);

// ─── 2. Connect ─────────────────────────────────────────────────────────────
console.log(`Connecting to ${WS_URL} …`);
const api = await ApiPromise.create({ provider: new WsProvider(WS_URL) });
const chain = (await api.rpc.system.chain()).toString();
console.log(`Chain: ${chain}`);

let account = null;
if (MNEMONIC || PRIVATE_KEY) {
  const keyring = MNEMONIC
    ? new Keyring({ type: "sr25519", ss58Format: 42 })
    : new Keyring({ type: "ecdsa" });
  account = keyring.addFromUri(MNEMONIC || PRIVATE_KEY);
  console.log(`Signer SS58: ${account.address}`);
}

// ─── 3. Off-chain dry-run via runtime API ───────────────────────────────────
// pallet-revive exposes a ReviveApi runtime call that lets you execute a
// contract call without producing a transaction. Free, instant, returns the
// raw output bytes which we ABI-decode back to the bool.
console.log("\n─── Dry-run (off-chain runtime call) ──────────────────────");
let dryOk = false;
try {
  const reviveApi = api.call.reviveApi;
  if (!reviveApi) throw new Error("api.call.reviveApi not present on this runtime");

  const methods = Object.keys(reviveApi);
  console.log(`Available reviveApi methods: ${methods.join(", ")}`);

  // The conventional name is `call` (mirrors pallet-contracts ContractsApi.call).
  // Args: (origin, dest, value, gas_limit, storage_deposit_limit, input_data)
  // origin: AccountId32 (Substrate) or H160 (mapped) — try a 32-byte zero origin first.
  const origin = account ? account.address : new Uint8Array(32);

  const result = await reviveApi.call(
    origin,
    CONTRACT,
    0n,                                              // value
    null,                                            // gas_limit: None = unlimited
    null,                                            // storage_deposit_limit: None = unlimited
    calldata,
  );

  console.log(`Raw result: ${result.toString()}`);
  // ContractResult { gas_consumed, gas_required, storage_deposit, debug_message, result }
  // result.result.Ok = (flags, data) where data is the ABI-encoded return.
  const json = result.toJSON ? result.toJSON() : result;
  if (json?.result?.ok || json?.result?.Ok) {
    const ok = json.result.ok || json.result.Ok;
    const returnData = ok.data || ok[1];
    console.log(`Return data: ${returnData}`);
    const [boolResult] = iface.decodeFunctionResult("verifyProof", returnData);
    console.log(`verifyProof returned: ${boolResult}`);
    dryOk = Boolean(boolResult);
  } else {
    console.log("Call did not succeed in dry-run.");
    console.log(JSON.stringify(json, null, 2));
  }
} catch (e) {
  console.log(`Dry-run error: ${e.message}`);
  console.log("(Continuing anyway — the runtime API shape can vary across versions.)");
}

if (DRYRUN_ONLY) {
  await api.disconnect();
  process.exit(dryOk ? 0 : 2);
}

// ─── 4. On-chain extrinsic submission ───────────────────────────────────────
console.log("\n─── On-chain submission (revive.call extrinsic) ───────────");
const { data: { free } } = await api.query.system.account(account.address);
console.log(`Balance: ${free.toHuman()}`);
if (free.isZero()) {
  console.error("No balance — fund the account first.");
  await api.disconnect();
  process.exit(1);
}

const tx = api.tx.revive.call(
  CONTRACT,
  0n,                                                // value
  { refTime: 5_000_000_000n, proofSize: 131_072n }, // gasLimit — plenty for a pairing
  100_000_000_000_000n,                              // storageDepositLimit — generous
  calldata,
);

await new Promise((resolve, reject) => {
  let unsub;
  tx.signAndSend(account, (result) => {
    const { status, events, dispatchError } = result;
    console.log(`  Status: ${status.type}`);

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
      const blockHash = (status.isInBlock ? status.asInBlock : status.asFinalized).toHex();
      console.log(`  Block hash: ${blockHash}`);
      for (const { event } of events) {
        const sec = event.section, name = event.method;
        if (sec === "revive" || sec === "system") {
          console.log(`  ${sec}.${name}: ${JSON.stringify(event.data.toHuman())}`);
        }
      }
      console.log(`\n─────────────────────────────────────────`);
      console.log(`Verifier call submitted to ${chain}`);
      console.log(`  Contract: ${CONTRACT}`);
      console.log(`  Block:    ${blockHash}`);
      console.log(`  Dry-run boolean: ${dryOk}`);
      console.log(`─────────────────────────────────────────`);
      unsub?.();
      resolve();
    }
  }).then(u => { unsub = u; }).catch(reject);
});

await api.disconnect();
process.exit(0);
