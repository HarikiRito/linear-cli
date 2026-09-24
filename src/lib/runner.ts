/**
 * Centralized error exit helper.
 * Prints the error message to stderr and sets process.exitCode = 1.
 * Using exitCode instead of process.exit() ensures async I/O flushes first.
 */
export function exitError(e: { message: string }): void {
  console.error(e.message);
  process.exitCode = 1;
}

/**
 * Rejection handler for parseAsync() under exitOverride(). Commander already
 * wrote "error: ..." for parser failures — only propagate the exit code, don't reprint.
 */
export function handleParseError(err: unknown): void {
  if (err instanceof Error && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string' && code.startsWith('commander.')) {
      if (
        code === 'commander.helpDisplayed' ||
        code === 'commander.help' ||
        code === 'commander.version'
      ) {
        return; // exit 0
      }
      const exitCode = (err as { exitCode?: unknown }).exitCode;
      process.exitCode = typeof exitCode === 'number' ? exitCode : 1;
      return;
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}
