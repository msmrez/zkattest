# Project state for future agents

This file is the canonical context handoff for any new Claude Code session on this repo. Keep it current as the project evolves.

## Project

**zkAttest** is a trust-minimized Web2-attestation primitive for Polkadot's Proof-of-Personhood (PoP) system. Users prove they control an email address via a zero-knowledge proof of a DKIM signature — no centralized issuer in the trust path. The credential is designed to plug into Polkadot's People Chain as a **DIM2** (Decentralized Individuality Mechanism, tier 2) attestation source once the production interface is finalized.

- **Repo:** `github.com/msmrez/zkattest`
- **Active dev branch:** `claude/bold-curie-saJ7o`
- **Live site:** `https://msmrez.github.io/zkattest/` (auto-deployed via `.github/workflows/pages.yml` on push that touches `web/**`)
- **Upstream we depend on:** [zkEmail](https://zk.email) Circom circuits + `@zk-email/helpers`, and `pallet-revive` (Polkadot's PolkaVM runtime, live on Polkadot Asset Hub mainnet since early 2026)

## Live mainnet artifacts (Polkadot Asset Hub)

### Real zkEmail-derived circuit (315k constraints, current primary)
- Verifier contract: `0xca1a3ad129e204d9af942a30f7f09282d20e28bf`
- Deploy tx: `0x271f59aa8c7670809efb8f76c594628cc0eeb8bc9f68f796ca8eff8a8fbf1edc`
- CLI verify tx (real Groth16 proof → `true`): `0x82bdae3a8530797f890d41d279daccc087d3a4e7e35ecaf2b99275cad4f71acc`
- Gas: `refTime ≈ 3.93 × 10⁹`, `proofSize ≈ 19.6 KiB`

### Toy circuit (Multiplier(1000), 1 public input, used by the in-browser demo on the live site)
- Verifier contract: `0x4fa8678fb0188b29e49254759fb876eecdede468`
- Deploy tx: `0x487d1bd6f9bcffa28372bfa71f150093c09fa005cbdb67aed371209cc6f36e78`
- CLI verify tx: `0xe3e11b8a2b386e2aa77dd8168d7aac7200bb83529f44ad1d92e2922e061f76a8`
- Browser-submitted verify tx: `0x29c82fc367d01c04c477a81b41855e9b38eab2408c016e3b9d12ee26d89c58e5`
- Gas: `refTime ≈ 1.77 × 10⁹`, `proofSize ≈ 15.0 KiB`

### First (dead) deployment — left on chain as historical artifact
- `0x8411a1cdc01186966f654b7601266e64334d9356` — built from the wrong vkey (3 inputs but our toy emits 1). Replaced by the toy verifier above. Not referenced anywhere active.

## Repo layout

```
README.md                  Public project description, leads with real-circuit mainnet artifacts.
CLAUDE.md                  This file.
HOSTING.md                 Cloudflare R2 setup for circuit artifacts.
Cargo.toml                 Workspace root.

pallets/
  pallet-dkim-registry/    Governance-curated on-chain registry of trusted (domain, selector) → RSA pubkey.
                           5 source tests.
  pallet-zkattest/         Proof verification + nullifier + DIM2 integration.
                           18 source tests: 5 pallet tests + evm_abi 8 + revive_verifier 5.
                           PeopleInterface is currently MOCKED — depends on upstream
                           production pallet-people interface stabilization.

prover/                    TypeScript prover SDK (@zkattest/prover). Wraps @zk-email/helpers
                           + snarkjs. Browser + Node. Note: src/index.ts reshapeProof swaps
                           pi_b Fp2 limbs [c1,c0] → [c0,c1] to match Solidity convention —
                           DO NOT remove this swap.

scraper/                   Daily DKIM key scraper. Pulls live RSA keys from Gmail / Outlook /
                           Yahoo / ProtonMail / SendGrid. Output: scraper/dkim-archive.jsonl.
                           Feeds governance proposals to pallet-dkim-registry.

spike/                     Deploy + on-chain verify scripts (Node, @polkadot/api).
  Verifier.{sol,pvm,abi}   Real zkEmail circuit's Solidity verifier + PolkaVM bytecode.
  circuit.wasm             Witness generator (4.3 MB, in git).
  circuit_final.zkey       Proving key (182 MB, GITIGNORED — fetch from R2 or rebuild).
  verification_key.json    Groth16 vkey.
  deploy-substrate.mjs     Native Substrate API deploy (bypasses eth-rpc code 1010 bug).
                           Calls revive.mapAccount then revive.instantiateWithCode.
  gen-proof.mjs            Generates a synthetic-but-cryptographically-valid proof
                           (fresh RSA-2048 keypair, signs a DKIM-shaped header).
                           Outputs sample-proof.json.
  verify-substrate.mjs     ABI-encodes verifyProof, dry-runs via reviveApi.call,
                           then submits api.tx.revive.call extrinsic.

real-circuit/              The circom build pipeline for the real zkEmail circuit.
  zkattest_email.circom    Wrapper around @zk-email/circuits EmailVerifier with
                           maxHeadersLength=256, ignoreBodyHashCheck=1, no masking.
                           315k non-linear constraints. README.md has the full rebuild recipe.
  test-proof.mjs           Self-test: synthetic keypair → sign → prove → verify.
  Verifier.{sol,pvm,abi}   Mirror of the spike/ artifacts.
  *.ptau, *.zkey, *.r1cs   GITIGNORED (heavy build outputs).

scripts/
  upload-toy-to-r2.sh      Uploads web/circuit/* to R2 under email_ownership/ prefix.
  upload-real-to-r2.sh     Uploads spike/{wasm,zkey,vkey} to R2 under email_ownership/.
  fetch-zkemail-artifacts.sh   Stub. zkEmail doesn't publish prebuilt artifacts; use the
                               real-circuit build pipeline or download from R2.

web/                       Static GitHub Pages site. Single index.html, no build step.
  circuit/                 Toy circuit artifacts for in-browser demo.
  README.md                One-line deploy instructions.

.github/workflows/
  pages.yml                Deploy to GitHub Pages on push to web/**. Source: GitHub Actions.

private/                   GITIGNORED. User's strategic docs (grants, outreach, advisor notes,
                           state). Never push to public repo.
```

## R2 hosting (live)

- Bucket: `zkp-storage` on Cloudflare R2, owned by the user
- Account ID: `7b4c7b24cd77f3956eaf6d0185fe459a`
- Public URL: `https://pub-a34a2db2f64d4ca1b7914c0cfe6652fc.r2.dev/`
- Live artifacts:
  - `email_ownership/verification_key.json` (3 KB)
  - `email_ownership/circuit.wasm` (4.3 MB)
  - `email_ownership/circuit_final.zkey` (182 MB)
- Browser uses these via `ZKEMAIL_BASE_URL` constant in `web/index.html`

R2 has an IP-based egress filter that blocks Anthropic's cloud container IPs and the WebFetch proxy — verifications of `pub-…r2.dev` URLs must be done from the user's Mac. This is benign; consumer browsers and GitHub Pages visitors are not affected.

## Common pitfalls (in chronological order of discovery)

1. **eth-rpc code 1010**: `pallet-revive`'s Ethereum-compat shim rejects all transactions from H160 accounts funded via SS58 on Westend Asset Hub. Always use the native Substrate API (`@polkadot/api` + `api.tx.revive.*`), not ethers.js via `eth-rpc`. `spike/deploy-substrate.mjs` and `spike/verify-substrate.mjs` use the right path.

2. **`storageDepositLimit` = `null` ≠ "no limit"**. In `api.tx.revive.instantiateWithCode`, the parameter is `BalanceOf<T>` (compact), not `Option<Balance>`. `null` encodes as `0`, which fails any storage. Pass a large explicit value like `100_000_000_000_000n`.

3. **`revive.mapAccount` required before first contract use**. SS58 accounts must call `mapAccount()` once before they can deploy or call contracts. Already handled in `deploy-substrate.mjs` Step 1.

4. **pi_b Fp2 limb swap**. snarkjs serialises G2 points with the Fp2 limbs in `[c1, c0]` order; the Solidity Groth16 verifier expects `[c0, c1]`. Both `spike/gen-proof.mjs` (line ~80) and `prover/src/index.ts` (reshapeProof) do the swap. Don't remove it.

5. **Circuit ↔ Verifier vkey must match exactly.** The first deploy (`0x8411a1c…`) used a Verifier.sol built from a different circuit (3 public inputs) than the actual proofs (1 public input). On-chain returned `false` for valid proofs. Always regenerate Verifier.sol from the same zkey you'll use for proving.

6. **Browser uses `@polkadot/api@16`, not `@14`**. The runtime API for `reviveApi` was added in v15-v16; v14 in the browser silently omits it and `api.call.reviveApi` is undefined. Pinned in `web/index.html` to `@16`.

7. **GitHub Pages source must be "GitHub Actions"**, not "Deploy from a branch". The pages.yml workflow uses the actions/deploy-pages action and that path requires GH Actions as the source. Configured at github.com/msmrez/zkattest/settings/pages.

## What's done

- [x] Real zkEmail-derived Groth16 circuit built from circom source, end-to-end verified on Polkadot Asset Hub mainnet
- [x] PVM verifier compiles via `resolc 1.1.0` from a snarkjs-generated `Verifier.sol` — no source modifications
- [x] FRAME pallets (`pallet-dkim-registry`, `pallet-zkattest`) with 23 source tests
- [x] DKIM scraper pulling live keys (Gmail, Outlook, Yahoo, ProtonMail, SendGrid)
- [x] TypeScript prover SDK wrapping `@zk-email/helpers` + snarkjs
- [x] Browser demo on GitHub Pages: drag-drop .eml → DKIM parse → toy-circuit proof in-browser → wallet-signed on-chain submit to deployed toy Verifier on Polkadot mainnet
- [x] Cloudflare R2 hosting the real-circuit artifacts (wasm + zkey + vkey)
- [x] CLI gen-proof + verify-substrate scripts reproducible by anyone
- [x] Repo cleanup: strategy docs moved to `private/` (gitignored)
- [x] Wallet auto-reconnect across page reloads (localStorage flag)

## What's next (priority order)

1. **Stakeholder feedback** — prepare People/Individuality and grant-route feedback requests from private drafts. Keep names, messages, and outreach status out of tracked files.
2. **Browser ↔ real circuit** — currently the browser demo uses the toy circuit. To use the real circuit in browser, we need:
   - `@zk-email/helpers` loaded in the browser to convert raw .eml → circuit inputs
   - Chunked zkey streaming (snarkjs supports it; zkemail's snarkjs fork makes this nicer)
   - Update calldata encoding for `uint256[3]` shape
3. **`pallet-zkattest` against real `pallet-people`** — currently mocked. Depends on the production People interface becoming stable enough to target.
4. **RFC to polkadot-fellows/RFCs** formalizing the DIM2 attestation source convention.
5. **Independent audit** of circuit + pallet (deferred until upstream interface frozen).
6. **Funding route** — prepare the current proposal package after the target route is confirmed. Keep private drafts under `private/`.

## Important conventions for editing this codebase

- Never push `private/`, `*.zkey`, `*.ptau`, `*.r1cs`, or `sample-proof.json` to the public repo. `.gitignore` handles this; if you change paths, update it.
- Don't fork or reimplement zkEmail's Circom circuits. Use `@zk-email/circuits` directly. Their EmailVerifier template is upstream-maintained.
- Don't change the contract addresses or tx hashes in README/index.html unless a new deploy has actually happened. They're cited in grant proposals and outreach.
- The `claude/bold-curie-saJ7o` branch is the active dev branch. Don't merge to `main` (there is no `main`).
- When pushing to GitHub, use `git push -u origin claude/bold-curie-saJ7o`.
- The R2 endpoint accepts S3 v4 signatures via `aws s3 cp --endpoint-url=...`. The bucket is publicly readable but the IP allowlist blocks some cloud datacenter IPs (including Anthropic's container egress).

## Outreach + grants (private)

Grant drafts and outreach notes belong under `private/`, which is gitignored. Do not publish recipient names, messages, budgets, route-specific drafts, or outreach status in tracked files. Public docs should only state verified project status and generic funding-route context.
