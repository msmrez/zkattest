# Hosting circuit artifacts on Cloudflare R2

The real zkEmail Circom `.zkey` is multi-GB (chunked for browser streaming) —
too large for git or GitHub Pages. Cloudflare R2 is the recommended host:
S3-compatible, **free egress**, and costs ~$0.05/month for typical traffic.

## Two paths

| Path | What's hosted | Use when |
|---|---|---|
| **Toy circuit** (live now) | The ~500 KB `Multiplier(1000)` circuit already in `web/circuit/` | You want to prove the R2 → browser fetch pipeline is real today |
| **Real zkEmail circuit** (future) | The ~3 GB `EmailVerifier` circuit, built from circom source | Spike 02 deliverable — separate roadmap item |

This repo ships these scripts:

| Script | Purpose |
|---|---|
| `scripts/upload-toy-to-r2.sh` | Uploads the toy circuit from `web/circuit/` to R2 under the `email_ownership/` prefix |
| `scripts/upload-to-r2.sh` | Generic uploader (reads from `artifacts/zkemail/`) for when real artifacts exist |
| `scripts/fetch-zkemail-artifacts.sh` | Stub — zkEmail doesn't publish prebuilt artifacts, see comments in the script |

## One-time R2 setup

1. Sign in to Cloudflare → R2 → **Create bucket**. Name it whatever (e.g. `zkattest-circuits`).
2. R2 → bucket → **Settings → Public Access → Allow**. Copy the `pub-<hash>.r2.dev` URL.
3. R2 → **Manage R2 API Tokens** → create a token with read+write on the bucket. Save the access key + secret.
4. Note your **R2 account ID** (top-right of the R2 dashboard).
5. Install AWS CLI: `brew install awscli` (macOS) or your distro's equivalent.

## Upload the toy circuit (5 seconds, ~500 KB)

```bash
export R2_ACCOUNT_ID=<your-account-id>
export R2_ACCESS_KEY_ID=<from R2 API token>
export R2_SECRET_ACCESS_KEY=<from R2 API token>
export R2_BUCKET=<your bucket name>
# optional: export R2_PREFIX=email_ownership      # default

./scripts/upload-toy-to-r2.sh
```

The script uploads three files (`verification_key.json`, `circuit.wasm`,
`circuit_final.zkey`) under the configured prefix and prints a `curl` command
to verify they're live.

## Building real zkEmail artifacts (future, multi-hour spike)

zkEmail does NOT publish prebuilt artifacts — every project compiles its own
from circom source so circuit parameters (`maxHeadersLength`, `maxBodyLength`,
etc.) can be tuned. The build pipeline:

1. `circom -p bn128 --r1cs --wasm --sym EmailVerifier.circom`
2. Download a Powers of Tau file (~2 GB, hermez ceremony)
3. `snarkjs groth16 setup … final.zkey`
4. Chunk the final zkey using zkemail's snarkjs fork
5. `scripts/upload-to-r2.sh` (reads from `artifacts/zkemail/`)

This is tracked as Spike 02 in the roadmap.

## Wire into the website

Open `web/index.html`, find the `ZKEMAIL_BASE_URL` constant near the bottom of
the `<script>` block, and set it to your R2 public base (no trailing slash):

```js
const ZKEMAIL_BASE_URL = 'https://pub-xxxx.r2.dev/email_ownership';
```

The page expects these three keys directly under that prefix (matching the
upload script's layout):

- `${ZKEMAIL_BASE_URL}/circuit.wasm`
- `${ZKEMAIL_BASE_URL}/circuit_final.zkey`
- `${ZKEMAIL_BASE_URL}/verification_key.json`

The toy circuit at `web/circuit/` continues to work for the in-browser demo
regardless of whether R2 is wired.

## Wire into the prover SDK

`@zkattest/prover` already accepts URLs — `snarkjs.groth16.fullProve()` streams
directly from any `https://` source:

```typescript
import { prove } from '@zkattest/prover';

const result = await prove(rawEml, {
  wasmPath: 'https://pub-xxxx.r2.dev/email_ownership/circuit.wasm',
  zkeyPath: 'https://pub-xxxx.r2.dev/email_ownership/circuit_final.zkey',
  maxHeadersLength: 1024,
  maxBodyLength: 1536,
});
```

## CORS

R2 buckets serve with permissive CORS for public objects by default — the
browser can fetch from any origin including `localhost` (dev) and GitHub Pages
(prod). If you want to restrict, configure CORS rules in the R2 dashboard.

## Cost expectations

| Item | Cost |
|---|---|
| Storage | $0.015/GB/month — 3 GB ≈ $0.05/month |
| Egress | **$0** (R2's killer feature vs S3+CloudFront) |
| Writes (Class A) | 1k free/month, then $4.50/M |
| Reads (Class B) | 10M free/month, then $0.36/M |

For a typical zkAttest deployment, monthly cost is effectively zero unless you
exceed 10 million proof downloads.
