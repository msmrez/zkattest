/**
 * A 256-bit field element, represented as a hex string (with 0x prefix).
 * Matches the U256 type in pallet-zkattest.
 */
export type U256 = string; // "0x" + 64 hex chars

/**
 * A Groth16 proof in the form expected by the on-chain Verifier contract.
 * Maps directly to the (a, b, c) parameters of verifyProof().
 */
export interface Groth16Proof {
  a: [U256, U256];
  b: [[U256, U256], [U256, U256]];
  c: [U256, U256];
}

/**
 * The full output of the DKIM prover for one email.
 */
export interface ProofResult {
  proof: Groth16Proof;
  /** Public circuit signals, in circuit-defined order. */
  publicInputs: U256[];
  /**
   * The nullifier derived from publicInputs[nullifierIndex].
   * Stored on-chain to prevent replay. Equal to publicInputs[2] in the
   * standard zkEmail circuit layout.
   */
  nullifier: U256;
  /** The Poseidon hash of the DKIM public key (for DKIM registry lookup). */
  dkimKeyHash: U256;
  /** The email domain (e.g. "gmail.com") — revealed to caller for registry check. */
  domain: string;
  /** The DKIM selector (e.g. "20230601") — revealed to caller for registry check. */
  selector: string;
}

/**
 * Options passed to prove().
 */
export interface ProveOptions {
  /**
   * Path or URL to the circuit's .wasm file.
   * In a browser context, this is served as a static asset.
   */
  wasmPath: string;
  /**
   * Path or URL to the Groth16 zkey file (proving key).
   * In a browser context, this is served as a static asset.
   */
  zkeyPath: string;
  /**
   * Index of the nullifier in the public inputs array.
   * Default: 2 (standard zkEmail layout).
   */
  nullifierIndex?: number;
  /**
   * Maximum email header length in bytes (must match the compiled circuit).
   * Default: 1024 (matches the standard zkEmail circuit).
   */
  maxHeadersLength?: number;
  /**
   * Maximum email body length in bytes (must match the compiled circuit).
   * Default: 1536 (matches the standard zkEmail circuit).
   */
  maxBodyLength?: number;
  /**
   * Skip body hash verification. Use for header-only proofs (faster, smaller inputs).
   * Default: false.
   */
  ignoreBodyHashCheck?: boolean;
  /**
   * Fall back to the zkEmail DNS archive (archive.prove.email) if live DNS lookup fails.
   * Useful when the DKIM key has recently rotated or when DNS is unreachable.
   * Default: true.
   */
  fallbackToDnsArchive?: boolean;
}
