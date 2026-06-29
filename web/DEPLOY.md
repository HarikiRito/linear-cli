# Deploying to Vercel

The `web/` directory is a static SvelteKit SPA (`@sveltejs/adapter-static`, fallback `200.html`). It is deployed via `vercel.json` inside the `web/` directory.

## Vercel Dashboard Setup

1. Import the git repository at [vercel.com/new](https://vercel.com/new).
2. **Root Directory**: set to **`web/`** — this is required for Vercel to pick up `web/vercel.json` and build the right folder.
3. **Framework Preset**: choose **Other** (`vercel.json` sets `"framework": null`).
4. Deploy. Every push to `main` triggers an automatic redeploy.

## Deploying via Vercel CLI

```bash
npm i -g vercel
```

From the **`web/` directory**:

- `vercel` — preview deploy
- `vercel --prod` — production deploy

## pnpm Version Note

The root `package.json` pins `pnpm@9.0.0`; `web/package.json` uses `pnpm@11.9.0`. Vercel uses the root version. Align both to avoid build vs. local discrepancies.
