import type { Command } from 'commander';

/** Register the standard --api-key and --token auth options on a command. */
export function addAuthOptions(cmd: Command): Command {
  return cmd
    .option('--api-key <key>', 'Linear API key')
    .option('--token <token>', 'Linear access token');
}

/** Register --json and --pretty output options on a command. */
export function addJsonOptions(cmd: Command): Command {
  return cmd
    .option('--json', 'Output as JSON')
    .option('--pretty', 'Pretty-print JSON output (only with --json)');
}
