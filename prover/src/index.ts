/**
 * @zkattest/prover — public API
 *
 * Generates a Groth16 zero-knowledge proof that a user received a DKIM-signed
 * email, without revealing the email contents. The proof is suitable for
 * submission to the pallet-zkattest on-chain verifier.
 *
 * ## Usage
 *
 * ```typescript
 * import { prove } from '@zkattest/prover';
 *
 * const rawEml = fs.readFileSync('email.eml', 'utf8'); // or from Gmail API
 * const result = await prove(rawEml, {
 *   wasmPath: '/circuits/email_ownership.wasm',
 *   zkeyPath: '/circuits/email_ownership_final.zkey',
 * });
 *
 * // result.proof, result.publicInputs, result.nullifier are ready for on-chain submission
 * ```
 *
 * ## Circuit requirements
 *
 * The wasm/zkey must be compiled from a zkEmail-compatible Circom circuit that
 * uses DKIM-SHA256 verification and emits:
 *   publicInputs[0] = Poseidon hash of DKIM public key modulus
 *   publicInputs[1] = email body/subject commitment (circuit-dependent)
 *   publicInputs[2] = nullifier (Poseidon of proof randomness)
 *
 * The reference circuit is zkemail/zk-email-verify's email_ownership.circom.
 * See /circuits/ in this repo (TODO: add compiled artifacts in a future sprint).
 *
 * ## Browser vs. Node
 *
 * This package runs in both environments. In a browser, wasmPath/zkeyPath
 * should be URLs to static assets. Proving takes 20–90 seconds depending on
 * email length and device hardware. All computation is local — no data leaves
 * the user's machine.
 */

import * as snarkjs from 'snarkjs';
import { generateEmailVerifierInputs } from '@zk-email/helpers';
import { extractDkimHeader } from './eml.js';
import type { ProofResult, ProveOptions, Groth16Proof } from './types.js';

export type { ProofResult, ProveOptions, Groth16Proof };

/** Default index of the nullifier in the public signals array. */
const DEFAULT_NULLIFIER_INDEX = 2;

/**
 * Prove email ownership from a raw .eml string.
 *
 * @param eml       Raw email content (UTF-8 string).
 * @param options   Circuit paths and optional config.
 * @returns         Proof, public inputs, nullifier, domain, and selector.
 * @throws          If the email has no DKIM signature or an unsupported algorithm.
 */
export async function prove(eml: string, options: ProveOptions): Promise<ProofResult> {
  const { wasmPath, zkeyPath, nullifierIndex = DEFAULT_NULLIFIER_INDEX } = options;

  // 1. Parse DKIM header — fails fast if email is not provable
  const dkimHeader = extractDkimHeader(eml);
  if (!dkimHeader) {
    throw new Error('No DKIM-Signature header found. The email cannot be proved.');
  }

  // 2. Build circuit inputs from the raw email + DKIM metadata.
  //    Calls @zk-email/helpers for canonicalization, DNS lookup, and padding.
  const circuitInputs = await buildCircuitInputs(eml, dkimHeader, options);

  // 3. Generate the Groth16 proof using snarkjs (runs the WASM circuit).
  //    This is the heavy step — 20–90s depending on hardware.
  const { proof: rawProof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasmPath,
    zkeyPath,
  );

  // 4. Reshape snarkjs output into our canonical types.
  const proof = reshapeProof(rawProof);
  const publicInputs = publicSignals.map(toU256);

  if (publicInputs.length <= nullifierIndex) {
    throw new Error(
      `Circuit emitted ${publicInputs.length} public signals but nullifierIndex is ${nullifierIndex}. ` +
      `Check that the circuit matches the expected layout.`
    );
  }

  return {
    proof,
    publicInputs,
    nullifier: publicInputs[nullifierIndex],
    dkimKeyHash: publicInputs[0],
    domain: dkimHeader.domain,
    selector: dkimHeader.selector,
  };
}

/**
 * Build the witness inputs object for the zkEmail circuit.
 *
 * Calls @zk-email/helpers.generateEmailVerifierInputs, which handles:
 *   - DNS TXT record lookup for the DKIM public key (via DNS-over-HTTPS in the browser)
 *   - RSA signature verification against the fetched key
 *   - RFC 6376 canonicalization (relaxed or simple, per the email's c= tag)
 *   - SHA-256 body hashing and precomputation
 *   - Chunking all values into BN254 field-element-sized bigint strings for the circuit
 *
 * DNS lookup failures fall back to the zkEmail DNS archive (archive.prove.email)
 * when `fallbackToDnsArchive` is true (the default).
 */
async function buildCircuitInputs(
  eml: string,
  dkimHeader: { domain: string; selector: string; algorithm: string },
  options: ProveOptions,
): Promise<Record<string, unknown>> {
  const {
    maxHeadersLength,
    maxBodyLength,
    ignoreBodyHashCheck = false,
    fallbackToDnsArchive = true,
  } = options;

  const inputs = await generateEmailVerifierInputs(
    Buffer.from(eml),
    { maxHeadersLength, maxBodyLength, ignoreBodyHashCheck },
    { domain: dkimHeader.domain, fallbackToZKEmailDNSArchive: fallbackToDnsArchive },
  );

  return inputs as Record<string, unknown>;
}

/**
 * Reshape snarkjs proof output into our Groth16Proof type.
 * snarkjs returns { pi_a, pi_b, pi_c } with bigint strings.
 */
function reshapeProof(raw: {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
}): Groth16Proof {
  // pi_b's Fp2 limbs are swapped: snarkjs serialises [c1, c0] but the
  // Solidity Groth16 verifier (and our on-chain pallet-revive path)
  // expects [c0, c1]. Matches snarkjs's own exportSolidityCallData.
  return {
    a: [toU256(raw.pi_a[0]), toU256(raw.pi_a[1])],
    b: [
      [toU256(raw.pi_b[0][1]), toU256(raw.pi_b[0][0])],
      [toU256(raw.pi_b[1][1]), toU256(raw.pi_b[1][0])],
    ],
    c: [toU256(raw.pi_c[0]), toU256(raw.pi_c[1])],
  };
}

/** Convert a decimal bigint string to a 0x-prefixed 32-byte hex string. */
function toU256(decimal: string): string {
  return '0x' + BigInt(decimal).toString(16).padStart(64, '0');
}

/**
 * Verify a proof locally (without submitting to chain).
 * Useful for testing circuit outputs before paying gas.
 *
 * @param proof         The Groth16 proof.
 * @param publicInputs  The public circuit signals.
 * @param vkeyPath      Path or URL to the verifier key JSON.
 */
export async function verifyLocally(
  proof: Groth16Proof,
  publicInputs: string[],
  vkeyPath: string,
): Promise<boolean> {
  const vkey = await fetch(vkeyPath).then(r => r.json());
  const snarkjsProof = {
    pi_a: [...proof.a, '1'],
    pi_b: [...proof.b, ['1', '0']],
    pi_c: [...proof.c, '1'],
    protocol: 'groth16',
  };
  return snarkjs.groth16.verify(vkey, publicInputs.map(s => BigInt(s).toString()), snarkjsProof);
}
