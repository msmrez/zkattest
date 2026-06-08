//! `ReviveVerifier` — bridges `Groth16Verify` to the deployed `Verifier.sol` on PolkaVM.
//!
//! ## Architecture
//!
//! Phase 1 uses the `Verifier.sol` compiled to PolkaVM bytecode (`Verifier.pvm`) and
//! deployed on Asset Hub via `pallet-revive`. This module provides a `Groth16Verify`
//! implementation that ABI-encodes the proof and calls the contract through the `EvmCall`
//! trait, which the runtime implements by wrapping `pallet_revive::Pallet::<T>::bare_call`.
//!
//! ## Wiring in the runtime
//!
//! ```rust,ignore
//! // In runtime/lib.rs:
//!
//! pub struct PvmVerifier;
//!
//! impl pallet_zkattest::revive_verifier::EvmCall for PvmVerifier {
//!     fn call(
//!         dest: [u8; 20],
//!         calldata: sp_std::vec::Vec<u8>,
//!     ) -> Result<sp_std::vec::Vec<u8>, ()> {
//!         use pallet_revive::{Determinism, DepositLimit};
//!         use frame_support::weights::Weight;
//!
//!         let result = pallet_revive::Pallet::<Runtime>::bare_call(
//!             dest.into(),
//!             0u128,
//!             Weight::MAX,
//!             DepositLimit::Unchecked,
//!             calldata,
//!             false,
//!             Determinism::Enforced,
//!         );
//!         match result.result {
//!             Ok(exec) if !exec.did_revert() => Ok(exec.data),
//!             _ => Err(()),
//!         }
//!     }
//! }
//!
//! parameter_types! {
//!     // H160 address of the deployed Verifier.pvm contract on Asset Hub.
//!     pub const VerifierAddress: [u8; 20] = hex_literal::hex!("YOUR_CONTRACT_H160");
//! }
//!
//! // In pallet_zkattest::Config for Runtime:
//! type Verifier = pallet_zkattest::revive_verifier::ReviveVerifier<PvmVerifier, VerifierAddress>;
//! ```

use core::marker::PhantomData;

use frame_support::traits::Get;
use sp_std::vec::Vec;

use crate::evm_abi;
use crate::pallet::Groth16Verify;
use crate::types::{Groth16Proof, U256};

/// Trait for dispatching a bare EVM contract call from within a pallet.
///
/// Implement this in the runtime by wrapping `pallet_revive::Pallet::<T>::bare_call`.
/// See the module-level doc comment for the exact wiring pattern.
pub trait EvmCall {
    /// Call an EVM contract at `dest` with `calldata`.
    ///
    /// Returns the return data on success, or `Err(())` on revert or execution failure.
    fn call(dest: [u8; 20], calldata: Vec<u8>) -> Result<Vec<u8>, ()>;
}

/// A [`Groth16Verify`] implementation backed by a deployed `Verifier.sol` on PolkaVM.
///
/// `C` is the [`EvmCall`] implementation (wired to `pallet-revive` in production).
/// `Addr` is a `Get<[u8; 20]>` constant providing the contract's H160 address.
pub struct ReviveVerifier<C, Addr>(PhantomData<(C, Addr)>);

impl<C: EvmCall, Addr: Get<[u8; 20]>> Groth16Verify for ReviveVerifier<C, Addr> {
    fn verify(proof: &Groth16Proof, public_inputs: &[U256]) -> bool {
        let calldata = evm_abi::encode_verify_call(proof, public_inputs);
        match C::call(Addr::get(), calldata) {
            Ok(output) => evm_abi::decode_verify_result(&output),
            Err(_) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Groth16Proof, U256};
    use frame_support::parameter_types;
    use sp_std::cell::RefCell;

    thread_local! {
        static MOCK_RETURN: RefCell<Option<Vec<u8>>> = RefCell::new(None);
        static RECEIVED_DEST: RefCell<Option<[u8; 20]>> = RefCell::new(None);
        static RECEIVED_CALLDATA_LEN: RefCell<usize> = RefCell::new(0);
    }

    struct TestCaller;
    impl EvmCall for TestCaller {
        fn call(dest: [u8; 20], calldata: Vec<u8>) -> Result<Vec<u8>, ()> {
            RECEIVED_DEST.with(|d| *d.borrow_mut() = Some(dest));
            RECEIVED_CALLDATA_LEN.with(|l| *l.borrow_mut() = calldata.len());
            MOCK_RETURN.with(|r| r.borrow().clone().ok_or(()))
        }
    }

    parameter_types! {
        pub const TestAddr: [u8; 20] = [0xde, 0xad, 0xbe, 0xef, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    type Verifier = ReviveVerifier<TestCaller, TestAddr>;

    fn zero_proof() -> Groth16Proof {
        Groth16Proof {
            a: [U256([0u8; 32]); 2],
            b: [[U256([0u8; 32]); 2]; 2],
            c: [U256([0u8; 32]); 2],
        }
    }

    #[test]
    fn returns_true_on_contract_success() {
        let mut out = vec![0u8; 32];
        out[31] = 1;
        MOCK_RETURN.with(|r| *r.borrow_mut() = Some(out));
        assert!(Verifier::verify(&zero_proof(), &[U256([0u8; 32]); 3]));
    }

    #[test]
    fn returns_false_on_contract_false() {
        MOCK_RETURN.with(|r| *r.borrow_mut() = Some(vec![0u8; 32]));
        assert!(!Verifier::verify(&zero_proof(), &[U256([0u8; 32]); 3]));
    }

    #[test]
    fn returns_false_on_contract_error() {
        MOCK_RETURN.with(|r| *r.borrow_mut() = None);
        assert!(!Verifier::verify(&zero_proof(), &[U256([0u8; 32]); 3]));
    }

    #[test]
    fn calls_correct_dest_address() {
        MOCK_RETURN.with(|r| *r.borrow_mut() = Some(vec![0u8; 32]));
        Verifier::verify(&zero_proof(), &[]);
        RECEIVED_DEST.with(|d| {
            assert_eq!(d.borrow().unwrap(), TestAddr::get());
        });
    }

    #[test]
    fn calldata_length_includes_selector_and_proof() {
        MOCK_RETURN.with(|r| *r.borrow_mut() = Some(vec![0u8; 32]));
        Verifier::verify(&zero_proof(), &[U256([0u8; 32]); 3]);
        // 4 selector + 8 proof words * 32 + 3 input words * 32 = 4 + 256 + 96 = 356
        RECEIVED_CALLDATA_LEN.with(|l| assert_eq!(*l.borrow(), 356));
    }
}
