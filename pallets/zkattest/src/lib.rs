//! # pallet-zkattest
//!
//! Zero-knowledge email attestation for Polkadot Proof-of-Personhood (DIM2).
//!
//! ## Overview
//!
//! This pallet is a DIM2 (Decentralized Individuality Mechanism, level 2)
//! attestation source for Polkadot's People Chain. It:
//!
//! 1. Accepts a Groth16 zero-knowledge proof that a user received a DKIM-signed
//!    email from a trusted provider (Gmail, Outlook, etc.)
//! 2. Verifies the proof against the registered DKIM public key via
//!    `T::Verifier`
//! 3. Checks the nullifier has not been used before (replay prevention)
//! 4. Calls `T::People::reserve_new_id()` then `T::People::recognize_personhood()`
//!    to register the user in the People Chain's ring-VRF member set
//!
//! ## Trust model
//!
//! The trust root is the DKIM public key registered in `pallet-dkim-registry`.
//! Governance controls which keys are trusted. No off-chain attester is required;
//! the ZK proof is verified entirely on-chain.
//!
//! ## Interface stability note
//!
//! `T::People` mirrors the `PeopleTrait` interface from polkadot-sdk's
//! `substrate/frame/support/src/traits/reality.rs`. That interface is WIP and
//! may change. The local `PeopleInterface` trait below will be replaced with a
//! direct dependency on polkadot-sdk once the interface stabilises.

#![cfg_attr(not(feature = "std"), no_std)]

pub mod evm_abi;
pub mod revive_verifier;
pub mod types;

#[cfg(test)]
mod mock;
#[cfg(test)]
mod tests;

pub use pallet::*;

#[frame_support::pallet]
pub mod pallet {
    use super::types::*;
    use frame_support::pallet_prelude::*;
    use frame_system::pallet_prelude::*;
    use pallet_dkim_registry::pallet::{Domain, Selector};

    /// Local mirror of PeopleTrait from polkadot-sdk reality.rs.
    /// Replace with the upstream trait once pallet-people is stable.
    pub trait PeopleInterface {
        fn reserve_new_id() -> PersonalId;
        fn recognize_personhood(id: PersonalId, key: Option<MemberKey>) -> DispatchResult;
        fn suspend_personhood(id: PersonalId) -> DispatchResult;
    }

    /// Trait for the on-chain Groth16 verifier.
    /// Phase 1: implemented by the EVM contract on Asset Hub (called via pallet-revive).
    /// Phase 2: implemented as a native FRAME pallet.
    pub trait Groth16Verify {
        /// Returns true iff the proof is valid for the given public inputs.
        fn verify(proof: &Groth16Proof, public_inputs: &[U256]) -> bool;
    }

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    #[pallet::config]
    pub trait Config: frame_system::Config + pallet_dkim_registry::Config {
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;

        /// The People Chain integration point. Wired to pallet-people in production.
        /// Use MockPeople in tests.
        type People: PeopleInterface;

        /// The on-chain Groth16 verifier.
        /// Phase 1: a stub that calls the EVM contract.
        /// Phase 2: a native pallet.
        type Verifier: Groth16Verify;

        /// Origin allowed to revoke attestations (governance track).
        type RevokeOrigin: EnsureOrigin<Self::RuntimeOrigin>;

        /// Index of the nullifier in the public inputs array.
        /// Standard zkEmail layout: 2. Override if using a different circuit.
        #[pallet::constant]
        type NullifierIndex: Get<u32>;
    }

    /// Used nullifiers — prevents the same email proof from being reused.
    #[pallet::storage]
    pub type Nullifiers<T: Config> = StorageMap<_, Blake2_256, Nullifier, (), OptionQuery>;

    /// Attestation records keyed by PersonalId.
    #[pallet::storage]
    pub type Attestations<T: Config> =
        StorageMap<_, Blake2_128Concat, PersonalId, AttestationRecord, OptionQuery>;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        /// A new email attestation was issued and a PersonalId registered.
        Attested {
            id: PersonalId,
            /// Poseidon hash of the email domain — revealed for auditability.
            domain_hash: [u8; 32],
        },
        /// A PersonalId was revoked (email key compromised or policy change).
        Revoked { id: PersonalId },
    }

    #[pallet::error]
    pub enum Error<T> {
        /// The ZK proof did not verify.
        InvalidProof,
        /// This nullifier has already been used — replay attempt.
        NullifierAlreadyUsed,
        /// The DKIM key for (domain, selector) is not registered or not allowed.
        UntrustedDkimKey,
        /// The public inputs array is shorter than expected.
        MalformedPublicInputs,
        /// No attestation record found for this PersonalId.
        AttestationNotFound,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Submit a ZK proof of email ownership and earn a PersonalId.
        ///
        /// `proof`         — Groth16 proof (a, b, c)
        /// `public_inputs` — circuit public signals; nullifier at index NullifierIndex
        /// `domain`        — email provider domain (e.g. "gmail.com")
        /// `selector`      — DKIM selector (e.g. "20230601")
        /// `member_key`    — the ring-VRF public key to register with pallet-people
        #[pallet::call_index(0)]
        #[pallet::weight(Weight::from_parts(500_000_000, 0))]
        pub fn attest(
            origin: OriginFor<T>,
            proof: Groth16Proof,
            public_inputs: BoundedVec<U256, ConstU32<32>>,
            domain: Domain,
            selector: Selector,
            member_key: MemberKey,
        ) -> DispatchResult {
            let _who = ensure_signed(origin)?;

            // 1. Check DKIM key is trusted.
            ensure!(
                pallet_dkim_registry::Pallet::<T>::is_trusted(&domain, &selector),
                Error::<T>::UntrustedDkimKey
            );

            // 2. Extract nullifier from public inputs.
            let nullifier_idx = T::NullifierIndex::get() as usize;
            ensure!(public_inputs.len() > nullifier_idx, Error::<T>::MalformedPublicInputs);
            let nullifier = Nullifier::from(public_inputs[nullifier_idx].clone());

            // 3. Replay check.
            ensure!(!Nullifiers::<T>::contains_key(&nullifier), Error::<T>::NullifierAlreadyUsed);

            // 4. Verify the ZK proof.
            ensure!(
                T::Verifier::verify(&proof, &public_inputs),
                Error::<T>::InvalidProof
            );

            // 5. Register with the People Chain.
            let id = T::People::reserve_new_id();
            T::People::recognize_personhood(id, Some(member_key))?;

            // 6. Record the nullifier and attestation.
            Nullifiers::<T>::insert(&nullifier, ());
            let block_number: u32 = frame_system::Pallet::<T>::block_number()
                .try_into()
                .unwrap_or(u32::MAX);
            // Store a Poseidon hash of the domain — auditability without full disclosure.
            // TODO: replace with actual Poseidon hash once circuit integration is complete.
            let domain_hash = sp_core::blake2_256(domain.as_ref());
            Attestations::<T>::insert(id, AttestationRecord { issued_at: block_number, domain_hash });

            Self::deposit_event(Event::Attested { id, domain_hash });
            Ok(())
        }

        /// Revoke a PersonalId (e.g. compromised email key, policy change).
        /// Callable by governance only.
        #[pallet::call_index(1)]
        #[pallet::weight(Weight::from_parts(10_000, 0))]
        pub fn revoke(
            origin: OriginFor<T>,
            id: PersonalId,
        ) -> DispatchResult {
            // Only governance can revoke — a user cannot revoke their own identity
            // without governance approval, to prevent coerced self-revocation.
            T::RevokeOrigin::ensure_origin(origin)?;

            ensure!(Attestations::<T>::contains_key(id), Error::<T>::AttestationNotFound);
            T::People::suspend_personhood(id)?;
            Attestations::<T>::remove(id);

            Self::deposit_event(Event::Revoked { id });
            Ok(())
        }
    }
}
