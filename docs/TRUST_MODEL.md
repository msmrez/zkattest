# zkAttest Trust Model

This document describes the assumptions behind the current zkAttest prototype.
It is intended for technical reviewers who want to understand the proof path and
the privacy boundaries.

For scope boundaries that affect grant review, see
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## 1. DKIM Provider DNS Trust

The email provider signs outgoing messages with a DKIM private key. Verifiers
check the corresponding public key published through DNS. zkAttest treats that
DKIM signature as the cryptographic trust root for email ownership claims.

## 2. DKIM Key Rotation and Expiry

DKIM keys rotate. A production registry needs activation, expiry, revocation,
and provenance metadata so old keys and current keys can be handled explicitly.

## 3. Governance-Managed DKIM Registry

The intended Polkadot-native registry is governance-managed. Governance can add,
expire, or revoke provider keys. The registry should expose enough metadata for
reviewers and applications to understand why a key is trusted.

## 4. ZK Email Upstream Circuit Assumptions

zkAttest reuses upstream ZK Email primitives rather than forking the DKIM proof
stack. The current real circuit is derived from `@zk-email/circuits` and uses
`@zk-email/helpers` plus `snarkjs` for proof generation.

## 5. Groth16 Trusted Setup Assumptions

The proof system uses Groth16. Verifiers rely on the circuit, proving key,
verification key, and setup ceremony artifacts matching each other. Artifact
hashes are recorded in `artifacts/MANIFEST.md`.

## 6. PolkaVM / BN254 Precompile Assumptions

The generated Solidity verifier is compiled to PolkaVM bytecode and executed
through `pallet-revive`. Correctness relies on the PolkaVM execution path and
BN254 pairing precompiles behaving as specified.

## 7. Nullifier Privacy Note

The current nullifier design is derived from DKIM signature bytes. Because an
email provider may be able to correlate DKIM signatures with sent messages, this
construction can allow provider-side correlation in some deployments. A
production DIM deployment should either improve this construction or document it
as an accepted privacy tradeoff.

## 8. Replay Prevention

The pallet stores nullifiers so the same proof cannot be reused. Production
policy needs to define the exact nullifier domain, whether salts or commitments
are used, and how replay prevention composes with privacy goals.

## 9. What the Email Provider Can Still Infer

The email provider already knows it signed the message. Depending on nullifier
construction and public inputs, it may be able to correlate a later attestation
with the original message. zkAttest hides email contents from the chain and
public verifier, but it cannot erase what the provider already knows.

## 10. What zkAttest Does Not Hide

The public chain can see the verifier call, public inputs, contract address,
nullifier, and account submitting the transaction. Wallet/account privacy,
relayer design, and statement-specific public inputs are separate product and
protocol decisions.

## Scope Boundary

Email ownership is a credential signal. It is useful for low-friction identity
and account ownership attestations, while unique-human policy belongs to the
broader People / Individuality mechanism.

zkAttest should first be evaluated as a supplemental DIM2-compatible credential
source for Polkadot People / Individuality, not as a standalone
proof-of-personhood mechanism.
