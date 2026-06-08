// Generates a synthetic but cryptographically valid set of circuit inputs:
//   - fresh RSA-2048 keypair
//   - synthetic email header (zero-padded to 256 bytes, SHA-256-padded)
//   - real RSA-SHA256 signature of that header
// Then runs snarkjs.groth16.fullProve + verify against verification_key.json.
//
// If this passes, the artifacts (final.zkey + vkey + wasm) are sound and ready
// to ship to R2 + redeploy on-chain.

import { generateKeyPairSync, createSign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import * as snarkjs from "snarkjs";

// ─── helpers ──────────────────────────────────────────────────────────────
// 121-bit chunking (zkEmail convention): split a 2048-bit bigint into 17 chunks
function chunkBigInt(value, n = 121n, k = 17) {
  const mask = (1n << n) - 1n;
  const out = [];
  for (let i = 0; i < k; i++) {
    out.push(((value >> (n * BigInt(i))) & mask).toString());
  }
  return out;
}

// SHA-256 padding per RFC: append 0x80, then zeros, then length-in-bits as big-endian uint64.
function sha256Pad(msgBytes) {
  const L = msgBytes.length;
  const padLen = ((L + 9 + 63) & ~63) - L - 9;
  const padded = Buffer.alloc(L + 1 + padLen + 8);
  msgBytes.copy(padded, 0);
  padded[L] = 0x80;
  // bit length as big-endian uint64
  const bitLen = BigInt(L) * 8n;
  for (let i = 7; i >= 0; i--) {
    padded[L + 1 + padLen + i] = Number((bitLen >> BigInt((7 - i) * 8)) & 0xffn);
  }
  return padded;
}

// ─── 1. fresh RSA-2048 keypair ────────────────────────────────────────────
console.log("Generating RSA-2048 keypair…");
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pubkeyJwk = publicKey.export({ format: "jwk" });
// JWK 'n' is base64url of the 256-byte modulus
const pubkeyN = BigInt("0x" + Buffer.from(pubkeyJwk.n, "base64url").toString("hex"));

// ─── 2. synthetic email header ────────────────────────────────────────────
// Shape it like a DKIM-signed body: starts with realistic header fields,
// padded with zeros so total length is < 256.
const headerStr = "from:test@example.com\r\nsubject:hello\r\ndate:Mon, 01 Jan 2026 00:00:00 +0000\r\n";
const headerBytes = Buffer.from(headerStr, "ascii");
console.log(`Raw header length: ${headerBytes.length} bytes`);

// Pad to maxHeadersLength = 256 with SHA-256 padding (per circuit's expectation)
const headerPadded = sha256Pad(headerBytes);
if (headerPadded.length > 256) throw new Error(`Padded header ${headerPadded.length} > 256`);
// emailHeaderLength = length INCLUDING SHA-256 padding (per circuit's @input doc).
// The bytes after that must be zero (enforced by AssertZeroPadding).
const emailHeaderLength = headerPadded.length;
const emailHeader = Array.from(headerPadded).concat(Array(256 - headerPadded.length).fill(0));

// ─── 3. RSA-SHA256 signature of the raw header ────────────────────────────
const signer = createSign("RSA-SHA256");
signer.update(headerBytes);
signer.end();
const sigBytes = signer.sign(privateKey);
const sigBigInt = BigInt("0x" + sigBytes.toString("hex"));

// ─── 4. build circuit inputs ──────────────────────────────────────────────
const inputs = {
  emailHeader: emailHeader.map(String),
  emailHeaderLength: String(emailHeaderLength),
  pubkey: chunkBigInt(pubkeyN),
  signature: chunkBigInt(sigBigInt),
};

writeFileSync("test-inputs.json", JSON.stringify(inputs, null, 2));
console.log(`Wrote test-inputs.json — ${inputs.emailHeader.length} header bytes, ${inputs.pubkey.length} pubkey chunks`);

// ─── 5. generate proof ────────────────────────────────────────────────────
console.log("\nGenerating Groth16 proof (this will take 10–60 s)…");
const t0 = Date.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  inputs,
  "zkattest_email_js/zkattest_email.wasm",
  "final.zkey",
);
const t1 = Date.now();
console.log(`  Done in ${((t1 - t0) / 1000).toFixed(1)} s`);
console.log(`  Public signals (${publicSignals.length}):`);
publicSignals.forEach((s, i) => console.log(`    [${i}] = ${s}`));

// ─── 6. verify locally ────────────────────────────────────────────────────
const vkey = JSON.parse(readFileSync("verification_key.json", "utf8"));
const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
console.log(`\nLocal verify: ${ok ? "OK ✓" : "FAILED"}`);
if (!ok) process.exit(1);

// ─── 7. save proof for later on-chain submission ──────────────────────────
const out = {
  inputs: { headerLength: emailHeaderLength },
  publicSignals,
  a: [proof.pi_a[0], proof.pi_a[1]],
  // snarkjs serialises pi_b as [c1, c0]; the Solidity verifier wants [c0, c1].
  b: [
    [proof.pi_b[0][1], proof.pi_b[0][0]],
    [proof.pi_b[1][1], proof.pi_b[1][0]],
  ],
  c: [proof.pi_c[0], proof.pi_c[1]],
};
writeFileSync("sample-proof.json", JSON.stringify(out, null, 2));
console.log("Wrote sample-proof.json — ready for spike/verify-substrate.mjs");
process.exit(0);
