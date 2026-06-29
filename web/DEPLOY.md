# Deploying to Vercel

The `web/` directory is a static SvelteKit SPA (`@sveltejs/adapter-static`, fallback `200.html`). It is deployed via `vercel.json` at the **repo root**.

## Vercel Dashboard Setup

1. Import the git repository at [vercel.com/new](https://vercel.com/new).
2. **Root Directory**: leave as the **repo root** (not `web/`). The `vercel.json` commands `cd` into `web/` themselves.
3. **Framework Preset**: choose **Other** (`vercel.json` sets `"framework": null`).
4. Deploy. Every push to `main` triggers an automatic redeploy.

## Deploying via Vercel CLI

```bash
npm i -g vercel
```

From the **repo root**:

- `vercel` — preview deploy
- `vercel --prod` — production deploy

The root `vercel.json` drives the build; no extra flags or config needed.

## pnpm Version Note

The root `package.json` pins `pnpm@9.0.0`; `web/package.json` uses `pnpm@11.9.0`. Vercel uses the root version. Align both to avoid build vs. local discrepancies.
