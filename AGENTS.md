# linear-cli — agent instructions

## Error handling (mandatory)
- **neverthrow only** for error flow in `src/`. No raw `try/catch` to catch + return/swallow/rethrow/branch.
  - Tolerant read: `Result.fromThrowable(() => JSON.parse(raw), toError)().unwrapOr(default)` (sync) · `ResultAsync.fromPromise(readFile(p,'utf8'), toError).unwrapOr('')` (async). `toError` is in `src/lib/errors.ts`.
- Control-flow probes (`O_EXCL`/`EEXIST` existence, `process.kill(pid,0)` liveness): prefer `Result.fromThrowable`; keep `try/catch` only if conversion hurts clarity, with a `// control-flow:` comment.
- `try/finally` for resource cleanup (fd/lock release) is fine.
