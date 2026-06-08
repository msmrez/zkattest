# zkAttest web

Single-file static website. No build step.

## Deployment

GitHub Pages is deployed via the `.github/workflows/pages.yml` workflow on every
push to `claude/bold-curie-saJ7o` that touches `web/**`. One-time setup:

1. Go to **Settings → Pages** on the GitHub repo
2. Source: **GitHub Actions**

Once set, every push to `web/**` republishes the site at
`https://msmrez.github.io/zkattest/` after the Pages workflow completes. No manual redeploy.

## After deploying a new toy Verifier contract for the browser demo

Edit `index.html`, find the toy demo constants near the bottom of the `<script>` block:

```js
const CONTRACT_ADDR = '0x...';  // toy verifier H160 used by the browser flow
const DEPLOY_TX     = '0x...';  // block hash from deploy-substrate.mjs
const VERIFY_TX     = '0x...';  // block hash from verify-substrate.mjs
```

The real zkEmail-derived verifier address is displayed separately in the
Technical section. Commit and push. The site re-deploys automatically.
