# linear-cli — agent instructions

Short, forceful. Follow unless an instruction explicitly overrides.

## Error handling (mandatory)
- **neverthrow only** for error flow in `src/`. No raw `try/catch` to catch + return/swallow/rethrow/branch.
  - Tolerant read idiom: `Result.fromThrowable(() => JSON.parse(raw), toError)().unwrapOr(default)` (sync) · `ResultAsync.fromPromise(readFile(p,'utf8'), toError).unwrapOr('')` (async).
  - `toError` lives in `src/lib/errors.ts`.
- Control-flow probes (`O_EXCL`/`EEXIST` existence, `process.kill(pid,0)` liveness): prefer `Result.fromThrowable`; keep raw `try/catch` only if conversion hurts clarity, with a `// control-flow:` comment.
- `try/finally` for resource cleanup (fd/lock release) is fine — that's not error handling.

## Code conventions
- Node ESM + tsdown. Local imports use `.js` extensions (`from '../../lib/scope.js'`).
- Secrets (tokens/api keys): file mode `0o600`, parent dir `0o700`. Read tolerates malformed/missing → empty default.
- Read-modify-write of shared stores (`credentials.json`, `projects.json`, `keepalive-state.json`) → wrap in `withConfigLock` (`src/lib/config-lock.ts`) to avoid lost-update races.
- Command layer (`features/*/command.ts`) may log. Lib code (`src/lib`, `src/features/*` non-command) must NOT `console.log`.
- Tests: vitest. Cover real branches — don't mock into triviality.

## Auth model (workspace-keyed)
- Files under `~/.config/.linear/`: `credentials.json` (sessions keyed by workspace id), `projects.json` (dir→`{workspace,team}` links), `config.toml` (global defaults), `keepalive-state.json` (per-workspace backoff).
- A directory MUST be linked in `projects.json` to resolve a credential. Unlinked → `UnauthenticatedError` + hint (`linear workspace select` / `linear login`). **No silent workspace fallback** (no auto-single, no `config.workspace`).
- Resolution: flags → env (`LINEAR_API_KEY`/`LINEAR_ACCESS_TOKEN`/`LINEAR_WORKSPACE`) → registry (linked cwd+ancestors) → Unauthenticated.
- Team is link-only (registry entry). No global-config `team` fallback.
- `linear login` auto-links cwd (no confirmation prompt). Single team/project auto-picked without prompting.

## Commands
- `pnpm run build` (tsdown → `dist/index.cjs`) · `pnpm test` (vitest) · `pnpm run typecheck` (`tsc --noEmit`) · `pnpm run lint` (biome + eslint).
- All gates must be green before commit. No `--force` push. No AI/Co-Authored-By attribution in commits.
