use crate::{mock::*, pallet::*};
use frame_support::{assert_noop, assert_ok};

fn domain(s: &str) -> Domain {
    s.as_bytes().to_vec().try_into().unwrap()
}

fn selector(s: &str) -> Selector {
    s.as_bytes().to_vec().try_into().unwrap()
}

fn pubkey(bytes: &[u8]) -> DkimPublicKey {
    bytes.to_vec().try_into().unwrap()
}

#[test]
fn set_and_get_key_works() {
    new_test_ext().execute_with(|| {
        let d = domain("gmail.com");
        let s = selector("20230601");
        let k = pubkey(&[0xaa; 256]);

        assert_ok!(DkimRegistry::set_key(RuntimeOrigin::root(), d.clone(), s.clone(), k.clone()));
        assert_eq!(DkimRegistry::get_key(&d, &s), Some(k));
    });
}

#[test]
fn remove_key_works() {
    new_test_ext().execute_with(|| {
        let d = domain("outlook.com");
        let s = selector("selector1");
        let k = pubkey(&[0xbb; 256]);

        assert_ok!(DkimRegistry::set_key(RuntimeOrigin::root(), d.clone(), s.clone(), k));
        assert_ok!(DkimRegistry::remove_key(RuntimeOrigin::root(), d.clone(), s.clone()));
        assert_eq!(DkimRegistry::get_key(&d, &s), None);
    });
}

#[test]
fn remove_nonexistent_key_fails() {
    new_test_ext().execute_with(|| {
        assert_noop!(
            DkimRegistry::remove_key(RuntimeOrigin::root(), domain("x.com"), selector("x")),
            Error::<Test>::KeyNotFound
        );
    });
}

#[test]
fn allowlist_gates_domains() {
    new_test_ext().execute_with(|| {
        let gmail = domain("gmail.com");
        let yahoo = domain("yahoo.com");
        let sel = selector("s");

        // Pre-populate keys for both
        assert_ok!(DkimRegistry::set_key(RuntimeOrigin::root(), gmail.clone(), sel.clone(), pubkey(&[1; 64])));
        assert_ok!(DkimRegistry::set_key(RuntimeOrigin::root(), yahoo.clone(), sel.clone(), pubkey(&[2; 64])));

        // Empty allowlist → both allowed
        assert!(DkimRegistry::is_domain_allowed(&gmail));
        assert!(DkimRegistry::is_domain_allowed(&yahoo));

        // Restrict to gmail only
        let list = vec![gmail.clone()].try_into().unwrap();
        assert_ok!(DkimRegistry::set_allowlist(RuntimeOrigin::root(), list));

        assert!(DkimRegistry::is_trusted(&gmail, &sel));
        assert!(!DkimRegistry::is_domain_allowed(&yahoo));
    });
}

#[test]
fn non_root_cannot_set_key() {
    new_test_ext().execute_with(|| {
        assert_noop!(
            DkimRegistry::set_key(
                RuntimeOrigin::signed(1),
                domain("gmail.com"),
                selector("s"),
                pubkey(&[0; 64]),
            ),
            frame_support::error::BadOrigin
        );
    });
}
