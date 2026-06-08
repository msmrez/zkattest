# zkAttest

![CI](https://github.com/msmrez/zkattest/actions/workflows/ci.yml/badge.svg)

**Polkadot-native DKIM/ZK Email attestations for People Chain evaluation.**

zkAttest lets a user prove possession of a DKIM-signed email with a
zero-knowledge proof, then verify that proof through Polkadot infrastructure.
The project builds on upstream ZK Email circuits and adds the Polkadot-specific
integration layer: PolkaVM verification, FRAME pallets, a governance-managed
DKIM registry, Polkadot wallet UX, and a People Chain / DIM integration path.

Links:

- Demo site: https://msmrez.github.io/zkattest/
- Repository: https://github.com/msmrez/zkattest

## What this is

zkAttest is a prototype credential source for Polkadot People / Project
Individuality evaluation. It explores a DIM2-compatible email-ownership signal
whose cryptographic trust path runs through:

1. the email provider's DKIM signature,
2. an on-chain DKIM key registry,
3. a Groth16 verifier compiled for PolkaVM / pallet-revive,
4. a FRAME pallet that handles proof verification, nullifiers, and attestation
   flow.

The current system demonstrates the core technical path:

- `.eml` parsing and DKIM metadata extraction in the browser demo,
- toy Groth16 browser proving and wallet-signed Asset Hub submission,
- a real zkEmail-derived circuit path through CLI / Node,
- proof verification against a deployed Asset Hub verifier,
- prototype FRAME pallets for DKIM registry and zkAttest logic.

zkAttest should first be evaluated as a supplemental DIM2-compatible credential
source for Polkadot People / Individuality, not as a standalone
proof-of-personhood mechanism.

## What this is not

zkAttest is not positioned as a standalone unique-humanity system.

Email ownership is an attestation signal. It does not, by itself, establish that
one account maps to one unique human. The intended first role is a supplemental
DIM2-compatible credential signal for Polkadot People / Individuality
evaluation, alongside stronger personhood mechanisms and policy decisions.

## Current status

| Component | State |
|---|---|
| Real zkEmail-derived Groth16 verifier on PolkaVM | Deployed and proof-verified on Polkadot Asset Hub mainnet |
| `pallet-dkim-registry` | Prototype complete, 5 source tests |
| `pallet-zkattest` | Prototype complete, 18 source tests: 5 pallet tests, 8 `evm_abi` tests, 5 `ReviveVerifier` tests |
| DKIM key scraper | Prototype that pulls real keys from Gmail, Outlook, Yahoo, ProtonMail, SendGrid |
| Prover SDK | TypeScript wrapper around `@zk-email/helpers` and `snarkjs` |
| Browser proof generation | Live toy-circuit Groth16 demo; real zkEmail-derived proof currently runs through CLI / Node |
| Browser on-chain submission | Wallet-signed `revive.call` to the deployed toy verifier |
| People Chain integration | Target path; production interface integration is grant work |

Proof-critical package versions used in this repo:

| Package | Version |
|---|---:|
| `@zk-email/helpers` | 6.4.2 |
| `@zk-email/circuits` | 6.3.4 |
| `snarkjs` | 0.7.6 |

Live mainnet artifacts for the current prototype:

Real zkEmail-derived circuit:

- Circuit: `real-circuit/zkattest_email.circom`
- Constraint count: approximately 315k
- Public inputs: 3
- Verifier contract: [`0xca1a3ad129e204d9af942a30f7f09282d20e28bf`](https://assethub-polkadot.subscan.io/account/0xca1a3ad129e204d9af942a30f7f09282d20e28bf)
- Deploy tx: `0x271f59aa8c7670809efb8f76c594628cc0eeb8bc9f68f796ca8eff8a8fbf1edc`
- Verify tx: `0x82bdae3a8530797f890d41d279daccc087d3a4e7e35ecaf2b99275cad4f71acc`
- Recorded gas: `refTime` about `3.93e9`, `proofSize` about `19.6 KiB`

Toy circuit used by the browser demo:

- Circuit: `web/circuit/circuit.circom`
- Verifier contract: `0x4fa8678fb0188b29e49254759fb876eecdede468`
- Verify tx: `0xe3e11b8a2b386e2aa77dd8168d7aac7200bb83529f44ad1d92e2922e061f76a8`
- Recorded gas: `refTime` about `1.77e9`, `proofSize` about `15.0 KiB`

See [artifacts/MANIFEST.md](artifacts/MANIFEST.md) for checksums and artifact
mapping.

## Demo status: toy browser circuit vs real zkEmail circuit

The web demo has two separate purposes:

1. It parses `.eml` files locally and extracts DKIM metadata.
2. It runs a real Groth16 proof in the browser using a small toy circuit, then
   submits that proof to a toy verifier on Asset Hub.

The production email circuit is separate. The real zkEmail-derived circuit has
been built and proof-verified through the CLI / Asset Hub path. Integrating full
real-email proving into the browser is future work.

People Chain pallet integration is also future work. The current pallet is a
prototype integration target, not a production People Chain deployment.

## Live demo

- Demo site: https://msmrez.github.io/zkattest/
- Repository: https://github.com/msmrez/zkattest

The demo page is intentionally explicit about status: browser proving is a toy
circuit, while the real zkEmail-derived proof path is currently CLI / Node plus
Asset Hub verification.

## Repository layout

```text
pallets/
  dkim-registry/          On-chain registry of trusted (domain, selector) to DKIM pubkey
  zkattest/               Proof verification, nullifier, and People Chain integration target
prover/                   TypeScript prover helpers
scraper/                  DKIM key scraper prototype
real-circuit/             Real zkEmail-derived circuit build recipe and verifier artifacts
spike/                    Asset Hub deploy, proof generation, and verifier scripts
web/                      Static GitHub Pages demo
artifacts/MANIFEST.md     Checksums and artifact mapping
docs/REPRODUCIBILITY.md   Reviewer reproduction paths
docs/TRUST_MODEL.md       Trust assumptions and privacy notes
HOSTING.md                Cloudflare R2 upload notes
```

## Reproducibility

See [docs/REPRODUCIBILITY.md](docs/REPRODUCIBILITY.md) for the full reviewer
checklist. Proof-critical dependency versions are pinned in the package files
and summarized in the current status table above.

## Real zkEmail path

Generate and locally verify a real zkEmail-derived Groth16 proof:

```bash
cd spike
npm install
curl -L https://pub-a34a2db2f64d4ca1b7914c0cfe6652fc.r2.dev/email_ownership/circuit_final.zkey -o circuit_final.zkey
node gen-proof.mjs
```

Expected signal:

- `node gen-proof.mjs` prints `Local verify: OK`.

## Browser demo path

```bash
cd web
python3 -m http.server 8000
```

Open http://localhost:8000, drop a DKIM-signed `.eml` file, generate the toy
Groth16 proof, and optionally connect a Polkadot wallet for the toy Asset Hub
verification flow.

## Asset Hub verifier path

Dry-run the real proof against the deployed Asset Hub verifier:

```bash
cd spike
DRYRUN_ONLY=1 CONTRACT=0xca1a3ad129e204d9af942a30f7f09282d20e28bf node verify-substrate.mjs
```

Expected signal:

- `verify-substrate.mjs` prints `verifyProof returned: true`.

## Known limitations

These are scope boundaries for the current prototype:

- Email ownership is a credential signal, not complete proof of unique humanity.
- The browser demo uses a toy Groth16 circuit; the full zkEmail-derived browser
  prover is grant work.
- The real circuit currently uses minimal parameters and synthetic test inputs.
- The `pallet-zkattest` People Chain path is prototype-level until the target
  People interface is finalized and integrated.
- DKIM key rotation, registry governance, nullifier privacy, and replay
  prevention require production policy decisions.

See [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) for the full list and
[docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) for the detailed trust model.

## Security and trust assumptions

The current design relies on:

- DKIM provider DNS keys being available and correctly represented in the
  registry,
- governance-managed activation, expiry, and revocation of DKIM keys,
- upstream ZK Email circuit correctness,
- Groth16 trusted setup and artifact integrity,
- PolkaVM / BN254 precompile correctness,
- nullifier construction that prevents replay while preserving the intended
  privacy properties.

## Roadmap / grant scope

Completed:

- [x] Groth16 verifier compiled to PolkaVM via `resolc 1.1.0`.
- [x] Real zkEmail-derived proof verified on Polkadot Asset Hub mainnet.
- [x] FRAME prototype pallets with 23 source tests.
- [x] Browser demo with DKIM parsing, toy Groth16 proof generation, and toy
      Asset Hub verifier submission.
- [x] DKIM scraper prototype with real key pulls.
- [x] Cloudflare R2 hosting for real-circuit `.wasm`, `.zkey`, and vkey
      artifacts.

Next:

- [ ] Reproducible build/devcontainer path.
- [ ] Production-oriented real email circuit parameters.
- [ ] Real zkEmail browser or hybrid prover path.
- [ ] `pallet-zkattest` integration against the production People interface.
- [ ] DIM2 attestation-source RFC / pre-proposal.
- [ ] Independent review of circuit, verifier, pallet, and registry assumptions.

## License

Apache-2.0. See [LICENSE](./LICENSE).
