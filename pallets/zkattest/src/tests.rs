use crate::{mock::*, pallet::*, types::*};
use frame_support::{assert_noop, assert_ok};
use pallet_dkim_registry::pallet::Domain;

fn dummy_proof() -> Groth16Proof {
    Groth16Proof {
        a: [U256([0u8; 32]), U256([0u8; 32])],
        b: [[U256([0u8; 32]), U256([0u8; 32])], [U256([0u8; 32]), U256([0u8; 32])]],
        c: [U256([0u8; 32]), U256([0u8; 32])],
    }
}

fn inputs_with_nullifier(nullifier_bytes: [u8; 32]) -> sp_runtime::BoundedVec<U256, sp_runtime::traits::ConstU32<32>> {
    let mut v = vec![U256([0u8; 32]), U256([0u8; 32]), U256(nullifier_bytes)];
    // Pad to ensure nullifier_idx=2 is accessible
    while v.len() < 3 {
        v.push(U256([0u8; 32]));
    }
    v.try_into().unwrap()
}

fn domain_bvec(s: &str) -> Domain {
    s.as_bytes().to_vec().try_into().unwrap()
}

#[test]
fn attest_happy_path() {
    new_test_ext().execute_with(|| {
        register_dkim_key("gmail.com", "20230601");
        PROOF_VALID.with(|v| *v.borrow_mut() = true);

        let inputs = inputs_with_nullifier([1u8; 32]);
        assert_ok!(ZkAttest::attest(
            RuntimeOrigin::signed(1),
            dummy_proof(),
            inputs,
            domain_bvec("gmail.com"),
            "20230601".as_bytes().to_vec().try_into().unwrap(),
            [0u8; 32],
        ));

        // PersonalId 0 should now be attested.
        assert!(Attestations::<Test>::contains_key(0));
    });
}

#[test]
fn replay_rejected() {
    new_test_ext().execute_with(|| {
        register_dkim_key("gmail.com", "s");
        PROOF_VALID.with(|v| *v.borrow_mut() = true);

        let inputs = inputs_with_nullifier([7u8; 32]);
        assert_ok!(ZkAttest::attest(
            RuntimeOrigin::signed(1),
            dummy_proof(),
            inputs.clone(),
            domain_bvec("gmail.com"),
            "s".as_bytes().to_vec().try_into().unwrap(),
            [0u8; 32],
        ));

        assert_noop!(
            ZkAttest::attest(
                RuntimeOrigin::signed(2),
                dummy_proof(),
                inputs,
                domain_bvec("gmail.com"),
                "s".as_bytes().to_vec().try_into().unwrap(),
                [0u8; 32],
            ),
            Error::<Test>::NullifierAlreadyUsed
        );
    });
}

#[test]
fn invalid_proof_rejected() {
    new_test_ext().execute_with(|| {
        register_dkim_key("gmail.com", "s");
        PROOF_VALID.with(|v| *v.borrow_mut() = false);

        assert_noop!(
            ZkAttest::attest(
                RuntimeOrigin::signed(1),
                dummy_proof(),
                inputs_with_nullifier([2u8; 32]),
                domain_bvec("gmail.com"),
                "s".as_bytes().to_vec().try_into().unwrap(),
                [0u8; 32],
            ),
            Error::<Test>::InvalidProof
        );
    });
}

#[test]
fn untrusted_domain_rejected() {
    new_test_ext().execute_with(|| {
        // No DKIM key registered for unknown.com
        PROOF_VALID.with(|v| *v.borrow_mut() = true);

        assert_noop!(
            ZkAttest::attest(
                RuntimeOrigin::signed(1),
                dummy_proof(),
                inputs_with_nullifier([3u8; 32]),
                domain_bvec("unknown.com"),
                "s".as_bytes().to_vec().try_into().unwrap(),
                [0u8; 32],
            ),
            Error::<Test>::UntrustedDkimKey
        );
    });
}

#[test]
fn revoke_works() {
    new_test_ext().execute_with(|| {
        register_dkim_key("gmail.com", "s");
        PROOF_VALID.with(|v| *v.borrow_mut() = true);

        assert_ok!(ZkAttest::attest(
            RuntimeOrigin::signed(1),
            dummy_proof(),
            inputs_with_nullifier([4u8; 32]),
            domain_bvec("gmail.com"),
            "s".as_bytes().to_vec().try_into().unwrap(),
            [0u8; 32],
        ));

        assert_ok!(ZkAttest::revoke(RuntimeOrigin::root(), 0));
        assert!(!Attestations::<Test>::contains_key(0));
    });
}
