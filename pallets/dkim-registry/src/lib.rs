//! # pallet-dkim-registry
//!
//! On-chain registry of trusted DKIM public keys used by pallet-zkattest to
//! validate email proofs. Keys are governance-gated to prevent silent trust-root
//! changes. Each entry maps (domain, selector) → RSA public key bytes.
//!
//! ## Governance model
//!
//! `T::UpdateOrigin` controls writes (add/remove keys, manage domain allowlist).
//! In production this should be a Polkadot OpenGov origin (e.g. GeneralAdmin or
//! a dedicated DKIM curator track). During testnet, EnsureRoot is fine.
//!
//! ## Key rotation
//!
//! Major providers rotate DKIM keys every 6–12 months. A companion off-chain
//! scraper monitors DNS and submits update extrinsics before keys expire.
//! The on-chain registry is the canonical source of truth; the scraper feeds it.

#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod mock;
#[cfg(test)]
mod tests;

#[frame_support::pallet]
pub mod pallet {
    use frame_support::pallet_prelude::*;
    use frame_system::pallet_prelude::*;

    // Maximum byte lengths — chosen to cover RSA-2048 keys and typical domain names.
    const MAX_DOMAIN_LEN: u32 = 253;   // RFC 1035 max domain length
    const MAX_SELECTOR_LEN: u32 = 63;  // RFC 1035 max label length
    const MAX_KEY_LEN: u32 = 550;      // RSA-2048 DER-encoded public key upper bound
    const MAX_DOMAINS: u32 = 256;      // max entries in domain allowlist

    pub type Domain = BoundedVec<u8, ConstU32<MAX_DOMAIN_LEN>>;
    pub type Selector = BoundedVec<u8, ConstU32<MAX_SELECTOR_LEN>>;
    pub type DkimPublicKey = BoundedVec<u8, ConstU32<MAX_KEY_LEN>>;

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    #[pallet::config]
    pub trait Config: frame_system::Config {
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
        /// Origin allowed to add/remove DKIM keys and manage the domain allowlist.
        /// Use EnsureRoot for tests; a governance track in production.
        type UpdateOrigin: EnsureOrigin<Self::RuntimeOrigin>;
    }

    /// Trusted DKIM public keys keyed by (domain, selector).
    /// Value is the raw RSA public key modulus bytes (big-endian).
    #[pallet::storage]
    pub type TrustedKeys<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat, Domain,
        Blake2_128Concat, Selector,
        DkimPublicKey,
        OptionQuery,
    >;

    /// Domains that are permitted as email senders for attestation.
    /// An empty list means all domains in TrustedKeys are allowed.
    #[pallet::storage]
    pub type DomainAllowlist<T: Config> = StorageValue<
        _,
        BoundedVec<Domain, ConstU32<MAX_DOMAINS>>,
        ValueQuery,
    >;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        /// A DKIM key was added or updated.
        KeySet { domain: Domain, selector: Selector },
        /// A DKIM key was removed.
        KeyRemoved { domain: Domain, selector: Selector },
        /// The domain allowlist was updated.
        AllowlistUpdated,
    }

    #[pallet::error]
    pub enum Error<T> {
        /// The domain string exceeds the maximum allowed length.
        DomainTooLong,
        /// The selector string exceeds the maximum allowed length.
        SelectorTooLong,
        /// The public key bytes exceed the maximum allowed length.
        KeyTooLong,
        /// Attempted to remove a key that does not exist.
        KeyNotFound,
        /// The allowlist would exceed the maximum number of entries.
        AllowlistFull,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Register or update a DKIM public key for (domain, selector).
        /// The key bytes should be the raw RSA modulus in big-endian order.
        #[pallet::call_index(0)]
        #[pallet::weight(Weight::from_parts(10_000, 0))]
        pub fn set_key(
            origin: OriginFor<T>,
            domain: Domain,
            selector: Selector,
            pubkey: DkimPublicKey,
        ) -> DispatchResult {
            T::UpdateOrigin::ensure_origin(origin)?;
            TrustedKeys::<T>::insert(&domain, &selector, &pubkey);
            Self::deposit_event(Event::KeySet { domain, selector });
            Ok(())
        }

        /// Remove a DKIM key entry.
        #[pallet::call_index(1)]
        #[pallet::weight(Weight::from_parts(10_000, 0))]
        pub fn remove_key(
            origin: OriginFor<T>,
            domain: Domain,
            selector: Selector,
        ) -> DispatchResult {
            T::UpdateOrigin::ensure_origin(origin)?;
            ensure!(TrustedKeys::<T>::contains_key(&domain, &selector), Error::<T>::KeyNotFound);
            TrustedKeys::<T>::remove(&domain, &selector);
            Self::deposit_event(Event::KeyRemoved { domain, selector });
            Ok(())
        }

        /// Replace the domain allowlist entirely.
        /// Pass an empty vec to permit all domains present in TrustedKeys.
        #[pallet::call_index(2)]
        #[pallet::weight(Weight::from_parts(10_000, 0))]
        pub fn set_allowlist(
            origin: OriginFor<T>,
            domains: BoundedVec<Domain, ConstU32<MAX_DOMAINS>>,
        ) -> DispatchResult {
            T::UpdateOrigin::ensure_origin(origin)?;
            DomainAllowlist::<T>::put(&domains);
            Self::deposit_event(Event::AllowlistUpdated);
            Ok(())
        }
    }

    impl<T: Config> Pallet<T> {
        /// Returns the DKIM public key for (domain, selector), if registered.
        pub fn get_key(domain: &Domain, selector: &Selector) -> Option<DkimPublicKey> {
            TrustedKeys::<T>::get(domain, selector)
        }

        /// Returns true if the domain is permitted for attestation.
        /// An empty allowlist means all registered domains are permitted.
        pub fn is_domain_allowed(domain: &Domain) -> bool {
            let allowlist = DomainAllowlist::<T>::get();
            allowlist.is_empty() || allowlist.contains(domain)
        }

        /// Returns true if (domain, selector) has a registered key AND the domain
        /// is on the allowlist (or the allowlist is empty).
        pub fn is_trusted(domain: &Domain, selector: &Selector) -> bool {
            Self::is_domain_allowed(domain) && TrustedKeys::<T>::contains_key(domain, selector)
        }
    }
}
