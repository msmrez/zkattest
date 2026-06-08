use crate as pallet_zkattest;
use crate::pallet::{Groth16Verify, PeopleInterface};
use crate::types::*;
use frame_support::{derive_impl, parameter_types, traits::ConstU32};
use sp_runtime::BuildStorage;
use std::cell::RefCell;

type Block = frame_system::mocking::MockBlock<Test>;

frame_support::construct_runtime!(
    pub enum Test {
        System: frame_system,
        DkimRegistry: pallet_dkim_registry,
        ZkAttest: pallet_zkattest,
    }
);

#[derive_impl(frame_system::config_preludes::TestDefaultConfig)]
impl frame_system::Config for Test {
    type Block = Block;
}

impl pallet_dkim_registry::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type UpdateOrigin = frame_system::EnsureRoot<u64>;
}

// Track issued PersonalIds in thread-local storage for test assertions.
thread_local! {
    static NEXT_ID: RefCell<PersonalId> = RefCell::new(0);
    static RECOGNIZED: RefCell<Vec<PersonalId>> = RefCell::new(vec![]);
    static SUSPENDED: RefCell<Vec<PersonalId>> = RefCell::new(vec![]);
    // When true, verify() returns true; when false, returns false.
    pub static PROOF_VALID: RefCell<bool> = RefCell::new(true);
}

pub struct MockPeople;
impl PeopleInterface for MockPeople {
    fn reserve_new_id() -> PersonalId {
        NEXT_ID.with(|n| {
            let id = *n.borrow();
            *n.borrow_mut() = id + 1;
            id
        })
    }
    fn recognize_personhood(id: PersonalId, _key: Option<MemberKey>) -> frame_support::dispatch::DispatchResult {
        RECOGNIZED.with(|r| r.borrow_mut().push(id));
        Ok(())
    }
    fn suspend_personhood(id: PersonalId) -> frame_support::dispatch::DispatchResult {
        SUSPENDED.with(|s| s.borrow_mut().push(id));
        Ok(())
    }
}

pub struct MockVerifier;
impl Groth16Verify for MockVerifier {
    fn verify(_proof: &Groth16Proof, _public_inputs: &[U256]) -> bool {
        PROOF_VALID.with(|v| *v.borrow())
    }
}

parameter_types! {
    pub const NullifierIndex: u32 = 2;
}

impl pallet_zkattest::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type People = MockPeople;
    type Verifier = MockVerifier;
    type RevokeOrigin = frame_system::EnsureRoot<u64>;
    type NullifierIndex = NullifierIndex;
}

pub fn new_test_ext() -> sp_io::TestExternalities {
    frame_system::GenesisConfig::<Test>::default()
        .build_storage()
        .unwrap()
        .into()
}

// Helpers for setting up trusted DKIM keys in tests.
use pallet_dkim_registry::pallet::{Domain, DkimPublicKey, Selector};

pub fn register_dkim_key(domain: &str, sel: &str) {
    let d: Domain = domain.as_bytes().to_vec().try_into().unwrap();
    let s: Selector = sel.as_bytes().to_vec().try_into().unwrap();
    let k: DkimPublicKey = vec![0xaa; 256].try_into().unwrap();
    pallet_dkim_registry::Pallet::<Test>::set_key(RuntimeOrigin::root(), d, s, k).unwrap();
}
