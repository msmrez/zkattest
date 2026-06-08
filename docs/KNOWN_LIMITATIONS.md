# Known Limitations

This document records scope boundaries for the current zkAttest prototype.

zkAttest should first be evaluated as a supplemental DIM2-compatible credential
source for Polkadot People / Individuality, not as a standalone
proof-of-personhood mechanism.

## Email ownership is not proof of personhood

zkAttest proves possession of a DKIM-signed email matching a claim. It does not
prove that the account belongs to a unique human.

## Shared or compromised inboxes

Shared inboxes, delegated access, or compromised accounts can produce valid
proofs.

## DKIM key lifecycle risk

DKIM keys rotate, expire, and can be misconfigured. A production deployment
needs explicit activation, expiry, revocation, and historical-key policy.

## Governance registry risk

A governance-managed DKIM registry can be stale, wrong, or malicious if
governance fails.

## Current browser demo uses a toy circuit

The current browser proof demo uses a small toy Groth16 circuit to demonstrate
browser proving, wallet connection, and verifier submission. It is not the full
zkEmail email-ownership circuit.

## Real zkEmail browser proving is not complete

The real zkEmail-derived proof path is currently demonstrated through CLI /
Node and Asset Hub verification. Browser or hybrid real-email proving is future
work.

## People Chain integration is not production-complete

Current People Chain / DIM integration is a target and prototype path, not a
production deployment.

## Nullifier privacy

If the nullifier is derived from DKIM signature material, the email provider may
be able to correlate the proof with a sent message. Production design should
improve this or document it as an accepted privacy tradeoff.

## Circuit parameters are not final

Current real-circuit parameters are spike-oriented. Production parameters should
increase header/body capacity, enable appropriate body hash checks, define exact
public inputs, and version artifacts with checksums.
