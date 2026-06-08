// Generates a real Groth16 proof against the zkEmail-derived EmailVerifier
// circuit (built by ../real-circuit/build pipeline). Inputs are synthetic but
// cryptographically valid: a fresh RSA-2048 keypair signs a small DKIM-shaped
// header, and the circuit verifies the signature in zero-knowledge.
//
// Writes sample-proof.json with the proof + 3 public signals
// (pubkeyHash, shaHi, shaLo) for verify-substrate.mjs to submit on-chain.
//
// Usage: node gen-proof.mjs
//
// Requires the real-circuit artifacts to be present in this directory:
//   circuit.wasm           (witness generator, ~4 MB — checked into git)
//   circuit_final.zkey     (proving key, ~182 MB — gitignored, download from R2
//                          or rebuild with ../real-circuit/)
//   verification_key.json  (for local verify — checked into git)
//
// If circuit_final.zkey is missing, see HOSTING.md for download instructions.

import { generateKeyPairSync, createSign } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as snarkjs from "snarkjs";

const ZKEY = new URL("./circuit_final.zkey", import.meta.url).pathname;
const WASM = new URL("./circuit.wasm", import.meta.url).pathname;
const VKEY = new URL("./verification_key.json", import.meta.url).pathname;

if (!existsSync(ZKEY)) {
  console.error(`Missing ${ZKEY}.`);
  console.error("Download it from R2 or rebuild it with ../real-circuit/. See HOSTING.md.");
  process.exit(1);
}

// ─── helpers ──────────────────────────────────────────────────────────────
// 121-bit chunking (zkEmail convention): split a 2048-bit bigint into 17 chunks
function chunkBigInt(value, n = 121n, k = 17) {
  const mask = (1n << n) - 1n;
  const out = [];
  for (let i = 0; i < k; i++) out.push(((value >> (n * BigInt(i))) & mask).toString());
  return out;
}

// SHA-256 padding per RFC: append 0x80, zeros, then length-in-bits as big-endian uint64.
function sha256Pad(msgBytes) {
  const L = msgBytes.length;
  const padLen = ((L + 9 + 63) & ~63) - L - 9;
  const padded = Buffer.alloc(L + 1 + padLen + 8);
  msgBytes.copy(padded, 0);
  padded[L] = 0x80;
  const bitLen = BigInt(L) * 8n;
  for (let i = 7; i >= 0; i--) padded[L + 1 + padLen + i] = Number((bitLen >> BigInt((7 - i) * 8)) & 0xffn);
  return padded;
}

// ─── 1. RSA-2048 keypair (fresh each run) ─────────────────────────────────
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pubkeyJwk = publicKey.export({ format: "jwk" });
const pubkeyN = BigInt("0x" + Buffer.from(pubkeyJwk.n, "base64url").toString("hex"));

// ─── 2. DKIM-shaped header ────────────────────────────────────────────────
const headerStr = "from:test@example.com\r\nsubject:hello\r\ndate:Mon, 01 Jan 2026 00:00:00 +0000\r\n";
const headerBytes = Buffer.from(headerStr, "ascii");
const headerPadded = sha256Pad(headerBytes);
if (headerPadded.length > 256) throw new Error(`Padded header ${headerPadded.length} > 256`);
const emailHeader = Array.from(headerPadded).concat(Array(256 - headerPadded.length).fill(0));

// ─── 3. RSA-SHA256 signature ──────────────────────────────────────────────
const signer = createSign("RSA-SHA256");
signer.update(headerBytes);
signer.end();
const sigBigInt = BigInt("0x" + signer.sign(privateKey).toString("hex"));

const inputs = {
  emailHeader: emailHeader.map(String),
  emailHeaderLength: String(headerPadded.length),
  pubkey: chunkBigInt(pubkeyN),
  signature: chunkBigInt(sigBigInt),
};

// ─── 4. Generate + verify proof ───────────────────────────────────────────
console.log("Generating Groth16 proof (real zkEmail circuit, ~15 s)…");
const t0 = Date.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, WASM, ZKEY);
console.log(`  Done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const vkey = JSON.parse(readFileSync(VKEY, "utf8"));
const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
console.log(`Local verify: ${ok ? "OK ✓" : "FAILED"}`);
if (!ok) process.exit(1);

// ─── 5. Save proof ────────────────────────────────────────────────────────
const out = {
  inputs: { headerLength: headerBytes.length, paddedLength: headerPadded.length },
  publicSignals,
  a: [proof.pi_a[0], proof.pi_a[1]],
  // snarkjs serialises pi_b as [c1, c0]; the Solidity verifier expects [c0, c1].
  b: [
    [proof.pi_b[0][1], proof.pi_b[0][0]],
    [proof.pi_b[1][1], proof.pi_b[1][0]],
  ],
  c: [proof.pi_c[0], proof.pi_c[1]],
};
writeFileSync(new URL("./sample-proof.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("Wrote spike/sample-proof.json");
console.log(`Public signals: pubkeyHash=${publicSignals[0]}, shaHi=${publicSignals[1]}, shaLo=${publicSignals[2]}`);
process.exit(0);
