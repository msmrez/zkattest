//! Ethereum ABI encoding/decoding for the Groth16 verifier bridge.
//!
//! The deployed `Verifier.sol` (compiled to PolkaVM via resolc) exposes:
//!   `verifyProof(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[3] input) → bool`
//!
//! All arguments are fixed-size, so the ABI encoding is a flat concatenation of
//! 32-byte big-endian words, prefixed by the 4-byte function selector.

use crate::types::{Groth16Proof, U256};
use sp_std::vec::Vec;

/// Function selector for `verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[3])`.
///
/// Computed as: keccak256("verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[3])")[..4]
pub const VERIFY_PROOF_SELECTOR: [u8; 4] = [0x47, 0x3a, 0x6d, 0xc8];

/// ABI-encode a `verifyProof` call into EVM calldata.
///
/// Layout (all words are 32-byte big-endian):
///   `[selector(4)] [a[0]] [a[1]] [b[0][0]] [b[0][1]] [b[1][0]] [b[1][1]] [c[0]] [c[1]] [inputs...]`
///
/// For the 3-input Verifier.sol used in Phase 1, `public_inputs` must have exactly 3 elements.
/// The function accepts any slice length for forward compatibility.
pub fn encode_verify_call(proof: &Groth16Proof, public_inputs: &[U256]) -> Vec<u8> {
    let word_count = 2 + 4 + 2 + public_inputs.len(); // a + b + c + inputs
    let mut buf = Vec::with_capacity(4 + word_count * 32);
    buf.extend_from_slice(&VERIFY_PROOF_SELECTOR);
    buf.extend_from_slice(&proof.a[0].0);
    buf.extend_from_slice(&proof.a[1].0);
    buf.extend_from_slice(&proof.b[0][0].0);
    buf.extend_from_slice(&proof.b[0][1].0);
    buf.extend_from_slice(&proof.b[1][0].0);
    buf.extend_from_slice(&proof.b[1][1].0);
    buf.extend_from_slice(&proof.c[0].0);
    buf.extend_from_slice(&proof.c[1].0);
    for input in public_inputs {
        buf.extend_from_slice(&input.0);
    }
    buf
}

/// Decode the ABI-encoded `bool` return value from `verifyProof`.
///
/// The EVM ABI encodes `bool` as a 32-byte word: all-zero = false, non-zero last byte = true.
/// Returns `false` for output shorter than 32 bytes (revert or empty output).
pub fn decode_verify_result(output: &[u8]) -> bool {
    output.len() >= 32 && output[31] != 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Groth16Proof, U256};

    fn zero() -> U256 {
        U256([0u8; 32])
    }

    fn one() -> U256 {
        let mut b = [0u8; 32];
        b[31] = 1;
        U256(b)
    }

    fn zero_proof() -> Groth16Proof {
        Groth16Proof {
            a: [zero(), zero()],
            b: [[zero(), zero()], [zero(), zero()]],
            c: [zero(), zero()],
        }
    }

    #[test]
    fn selector_correct() {
        assert_eq!(VERIFY_PROOF_SELECTOR, [0x47, 0x3a, 0x6d, 0xc8]);
    }

    #[test]
    fn encode_length_three_inputs() {
        // 4 selector + (2 + 4 + 2 + 3) * 32 = 4 + 352 = 356
        let calldata = encode_verify_call(&zero_proof(), &[zero(), zero(), zero()]);
        assert_eq!(calldata.len(), 356);
    }

    #[test]
    fn encode_selector_at_offset_zero() {
        let calldata = encode_verify_call(&zero_proof(), &[zero()]);
        assert_eq!(&calldata[..4], &VERIFY_PROOF_SELECTOR);
    }

    #[test]
    fn encode_proof_a_at_offset_four() {
        let proof = Groth16Proof {
            a: [one(), zero()],
            b: [[zero(); 2]; 2],
            c: [zero(); 2],
        };
        let calldata = encode_verify_call(&proof, &[zero()]);
        // a[0] at bytes 4..36
        assert_eq!(&calldata[4..36], &one().0);
        // a[1] at bytes 36..68
        assert_eq!(&calldata[36..68], &zero().0);
    }

    #[test]
    fn encode_public_input_at_correct_offset() {
        let input_val = one();
        let calldata = encode_verify_call(&zero_proof(), &[input_val.clone()]);
        // After selector(4) + a(64) + b(128) + c(64) = 260 bytes
        assert_eq!(&calldata[260..292], &input_val.0);
    }

    #[test]
    fn decode_true() {
        let mut out = [0u8; 32];
        out[31] = 1;
        assert!(decode_verify_result(&out));
    }

    #[test]
    fn decode_false_all_zero() {
        assert!(!decode_verify_result(&[0u8; 32]));
    }

    #[test]
    fn decode_false_short_output() {
        assert!(!decode_verify_result(&[]));
        assert!(!decode_verify_result(&[1u8; 16]));
    }
}
