# zkAttest Reproducibility Checklist

This document gives reviewers three independent paths through the current
prototype:

1. local web demo,
2. real zkEmail-derived circuit self-test,
3. Asset Hub dry-run verification.

The browser demo and the real email circuit are intentionally separate today.
The browser path proves a small toy circuit. The real zkEmail-derived proof path
currently runs through Node / CLI.

## Prerequisites

Recommended baseline:

- Node.js 20 or newer
- npm 10 or newer
- Python 3 for the static web server
- Git
- Network access to Polkadot Asset Hub RPC
- Network access to the public R2 artifact URLs

For rebuilding the real circuit from source, also install:

- `circom` 2.x
- `snarkjs` 0.7.6
- `resolc` 1.1.0
- `solc` 0.8.30

CI runs static checks, Rust workspace tests, web sanity checks, and a best-effort
prover TypeScript build. Full proof generation is documented here as a local
reviewer path because it depends on large proving artifacts and can be slow or
network-sensitive.

## A. Web demo local run

```bash
cd web
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

Reviewer checks:

- Drop a DKIM-signed `.eml` file.
- Confirm the page extracts DKIM domain, selector, canonicalization, DNS lookup
  location, and signature metadata.
- Generate the toy Groth16 proof in the browser.
- Confirm the proof verifies locally in the page.
- Optional: connect a Polkadot wallet and submit the toy proof to the deployed
  toy verifier on Asset Hub.

Expected result:

- The `.eml` stays in the page.
- The proof section shows a verified toy Groth16 proof.
- The on-chain section targets toy verifier
  `0x4fa8678fb0188b29e49254759fb876eecdede468`.

## B. Real zkEmail-derived circuit local self-test

This path tests the real circuit artifacts locally. It does not require a wallet.

```bash
cd real-circuit
npm install
node test-proof.mjs
```

Expected output includes:

```text
Generating RSA-2048 keypair
Generating Groth16 proof
Local verify: OK
Wrote sample-proof.json
```

Notes:

- The test generates a synthetic DKIM-shaped header and a fresh RSA-2048
  signature.
- The circuit verifies the signature in zero knowledge.
- A local run was observed around 15 seconds for proof generation, but hardware
  and Node.js version can change timing.

## C. Asset Hub dry-run verification

This path verifies a generated real proof through Polkadot Asset Hub's
`pallet-revive` runtime API without submitting an on-chain transaction.

```bash
cd spike
npm install
curl -L https://pub-a34a2db2f64d4ca1b7914c0cfe6652fc.r2.dev/email_ownership/circuit_final.zkey -o circuit_final.zkey
node gen-proof.mjs
DRYRUN_ONLY=1 CONTRACT=0xca1a3ad129e204d9af942a30f7f09282d20e28bf node verify-substrate.mjs
```

Expected output from `node gen-proof.mjs` includes:

```text
Generating Groth16 proof (real zkEmail circuit
Local verify: OK
Wrote spike/sample-proof.json
```

Expected output from `verify-substrate.mjs` includes:

```text
Chain: Polkadot Asset Hub
Dry-run (off-chain runtime call)
verifyProof returned: true
```

Troubleshooting:

- If `circuit_final.zkey` is missing, rerun the `curl` command above.
- If R2 access fails from a cloud environment, try from a consumer network. The
  bucket is public, but some cloud/datacenter egress IPs may be blocked.
- If the runtime API shape changes, update `@polkadot/api` and inspect available
  `api.call.reviveApi` methods.
- If the dry-run returns `false`, confirm the `CONTRACT` address matches the
  real zkEmail-derived verifier listed in `artifacts/MANIFEST.md`.
