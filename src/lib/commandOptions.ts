import type { Command } from 'commander';

/** Parse a comma-separated string into a trimmed, non-empty array. */
export function parseCsv(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Register the standard --api-key and --token auth options on a command. */
export function addAuthOptions(cmd: Command): Command {
  return cmd
    .option('--api-key <key>', 'Linear API key')
    .option('--token <token>', 'Linear access token');
}

/** Read the global --plain flag (registered once on the root program) from any subcommand. */
export function isPlain(cmd: Command): boolean {
  return !!cmd.optsWithGlobals().plain;
}
