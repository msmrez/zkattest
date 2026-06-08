//! Core types for pallet-zkattest.
//!
//! All ZK-specific types are kept here so the main pallet module stays focused
//! on storage and extrinsic logic.

use codec::{Decode, DecodeWithMemTracking, Encode, MaxEncodedLen};
use scale_info::TypeInfo;

/// A 256-bit field element. Used for Groth16 proof components and public inputs.
/// Stored as big-endian bytes, matching the Solidity verifier's uint256 layout.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Encode, Decode, MaxEncodedLen, TypeInfo)]
pub struct U256(pub [u8; 32]);

/// A Groth16 proof in the form expected by the BN254 verifier.
/// Maps directly to (a, b, c) in the Solidity Verifier.verifyProof signature.
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, MaxEncodedLen, TypeInfo)]
pub struct Groth16Proof {
    /// G1 point A
    pub a: [U256; 2],
    /// G2 point B (note: G2 uses 2×2 U256 in the Solidity ABI)
    pub b: [[U256; 2]; 2],
    /// G1 point C
    pub c: [U256; 2],
}

/// The public inputs for a zkEmail DKIM attestation circuit.
///
/// Layout matches the proof-of-twitter circuit's public signal ordering:
///   [0] = DKIM public key hash (Poseidon of the RSA modulus)
///   [1] = email commitment (Poseidon of the email body/header regex match)
///   [2] = nullifier (Poseidon of the proof-specific randomness)
///
/// For a generic email-ownership circuit the layout may differ; this type
/// is parameterised so the pallet accepts any fixed-length public input array.
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, MaxEncodedLen, TypeInfo)]
pub struct PublicInputs<const N: usize>(pub [U256; N]);

/// A nullifier derived from the ZK proof. Stored on-chain to prevent replay.
/// Equals public_inputs[2] in the standard zkEmail layout.
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, MaxEncodedLen, TypeInfo)]
pub struct Nullifier(pub [u8; 32]);

impl DecodeWithMemTracking for U256 {}
impl DecodeWithMemTracking for Groth16Proof {}
impl DecodeWithMemTracking for Nullifier {}
impl DecodeWithMemTracking for AttestationRecord {}

impl From<U256> for Nullifier {
    fn from(u: U256) -> Self {
        Nullifier(u.0)
    }
}

/// A 64-bit integer used as the PersonalId type, mirroring the PeopleTrait
/// definition in polkadot-sdk's substrate/frame/support/src/traits/reality.rs.
pub type PersonalId = u64;

/// A ring-VRF member key (32 bytes), used as the identity key registered with
/// pallet-people. In practice this is a Bandersnatch public key.
pub type MemberKey = [u8; 32];

/// Metadata stored per issued attestation.
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, MaxEncodedLen, TypeInfo)]
pub struct AttestationRecord {
    /// Block number at which the attestation was issued.
    pub issued_at: u32,
    /// Poseidon hash of the attested email domain — stored for auditability
    /// without revealing the full domain on-chain.
    pub domain_hash: [u8; 32],
}
