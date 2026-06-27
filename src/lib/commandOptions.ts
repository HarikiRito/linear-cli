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

/** Register the --plain output option on a command. */
export function addPlainOption(cmd: Command): Command {
  return cmd.option('--plain', 'Output as plain key:value text (agent-friendly)');
}
