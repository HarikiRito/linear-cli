/**
 * Centralized error exit helper.
 * Prints the error message to stderr and sets process.exitCode = 1.
 * Using exitCode instead of process.exit() ensures async I/O flushes first.
 */
export function exitError(e: { message: string }): void {
  console.error(e.message);
  process.exitCode = 1;
}
