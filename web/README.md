# SvelteKit Base Template

A lean, reusable SvelteKit SPA template. Ships as an SPA by default with a documented SSR toggle. Demonstrates idiomatic Svelte 5 (runes), shadcn-svelte components, neverthrow-based error handling, and a hybrid lint stack.

## Stack

- **Svelte 5** — runes-based reactive stores
- **SvelteKit 2** — SPA via `adapter-static`
- **Tailwind CSS v4** — CSS-first config (`@import "tailwindcss"`, no `tailwind.config.js`)
- **shadcn-svelte** — App* compound-namespace wrappers
- **neverthrow** — `Result`-based error handling (zero `try-catch` in src/)
- **Biome** — lints `.ts/.js/.json/.css`
- **ESLint + prettier-plugin-svelte** — lints/formats `.svelte` files
- **Vitest** — unit tests for stores and utilities

## Project Structure

```
web/
  src/
    components/          # shared components
      ui/                # shadcn-svelte components + App* wrappers
        button/
        card/
        input/
        label/
        dialog/
        dropdown-menu/
        sonner/
        AppButton.svelte
        AppCard.svelte
        AppInput.svelte
        AppSonner.svelte
    features/
      todos/
        todos.svelte.ts      # createTodosStore() — PRIMARY showcase
        todos.svelte.test.ts
      counter/
        counter.svelte.ts    # createCounterStore() — secondary pattern
        counter.svelte.test.ts
    services/
      todos.service.ts       # localStorage persistence, returns Result
    utils/
      cn.ts                  # clsx + tailwind-merge helper
      cn.test.ts
      result.ts              # neverthrow re-exports + helpers
    utils.ts                 # re-export facade for shadcn-svelte compat
    routes/
      +layout.svelte         # app shell + nav
      +layout.ts             # SPA config (ssr=false, prerender=true)
      +page.svelte           # landing page
      todos/
        +page.svelte         # todos showcase
    app.css                  # Tailwind v4 CSS-first config
  biome.json
  eslint.config.js
  prettier.config.js
  vite.config.ts             # adapter, alias, vitest config
  tsconfig.json
```

## SPA ↔ SSR Toggle

The app ships as an SPA. To switch to SSR, change exactly **two files**:

**`vite.config.ts`** — swap the adapter:
```diff
- import adapter from '@sveltejs/adapter-static';
+ import adapter from '@sveltejs/adapter-node';
  // ...
-   adapter: adapter({ fallback: '200.html' }),
+   adapter: adapter(),
```

**`src/routes/+layout.ts`** — flip the flags:
```diff
- export const ssr = false;
- export const prerender = true;
+ export const ssr = true;
+ export const prerender = false;
```

To revert to SPA mode, undo those two changes.

## Adding a Feature Store

1. Create `src/features/<name>/<name>.svelte.ts` with a factory function:

```ts
import { ok, err, type Result } from 'neverthrow';

export function createMyStore(initial = 0) {
  let count = $state(initial);
  const doubled = $derived(count * 2);

  function increment(): Result<number, never> {
    count += 1;
    return ok(count);
  }

  return {
    get count() { return count; },
    get doubled() { return doubled; },
    increment
  };
}
```

2. Import in a `.svelte` component:
```ts
import { createMyStore } from 'src/features/my/my.svelte';
const store = createMyStore();
```

Key rules:
- Use `$state` / `$derived` for reactive state
- All mutation methods return `Result<T, E>` — never use `try-catch`
- Return `err('ERROR_CODE')` for expected errors; use `ok(value)` for success

## Adding shadcn-svelte Components

```bash
npx shadcn-svelte@latest add <component-name> --yes
```

Then wrap in an `App*` compound component under `src/components/ui/`:

```svelte
<!-- src/components/ui/AppBadge.svelte -->
<script lang="ts">
  import { Badge } from 'src/components/ui/badge/index.js';
  import { cn } from 'src/utils/cn';
  let { class: className, ...rest } = $props();
</script>
<Badge class={cn(className)} {...rest} />
```

Import alias: all imports use `src/...` (no `$lib`, no `@` aliases):
```ts
import { cn } from 'src/utils/cn';
import AppButton from 'src/components/ui/AppButton.svelte';
```

## Scripts

```bash
pnpm dev          # start dev server
pnpm build        # build SPA (outputs build/200.html)
pnpm preview      # preview production build
pnpm lint         # Biome check (TS/JS) + ESLint check (Svelte)
pnpm lint:fix     # auto-fix lint issues
pnpm format       # Prettier format .svelte files
pnpm type:check   # TypeScript strict check
pnpm ci:lint      # CI lint gate (Biome CI + ESLint)
pnpm test         # run Vitest unit tests
```

## Design Conventions

- **No `src/lib`** — flat structure under `src/`
- **Single alias** — `src` maps to `./src`; use `src/...` for all cross-module imports
- **No try-catch** — use `neverthrow` `Result`/`ResultAsync` everywhere
- **No `any`** — prefer `unknown` / `satisfies` in TypeScript
- **PascalCase** for component files; **camelCase** for non-component files; **kebab-case** for route folders
- **`cn()`** for all conditional/merged Tailwind classes
- Function declarations preferred over arrow const assignments
- Max ~500 lines per file
