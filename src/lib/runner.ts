import { CommanderError } from 'commander';

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
  if (err instanceof CommanderError) {
    if (
      err.code === 'commander.helpDisplayed' ||
      err.code === 'commander.help' ||
      err.code === 'commander.version'
    ) {
      return; // exit 0
    }
    process.exitCode = err.exitCode;
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}
