import type { Command } from 'commander';
import { getGlobalConfigPath, readConfig } from './config-file.js';
import { resolveOutputMode } from './output-mode.js';

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

/**
 * Resolve the effective output mode (registered --plain/--table flags, LINEAR_OUTPUT
 * env, global config `output.default`) from any subcommand. Precedence: flag > env >
 * config > built-in default (table). Throws ValidationError for an invalid env/config
 * value.
 */
export function isPlain(cmd: Command): boolean {
  const opts = cmd.optsWithGlobals();
  const config = readConfig(getGlobalConfigPath());
  const result = resolveOutputMode({
    plainFlag: !!opts.plain,
    tableFlag: !!opts.table,
    env: process.env.LINEAR_OUTPUT,
    config: config.output?.default,
  });
  if (result.isErr()) throw result.error;
  return result.value === 'plain';
}

/**
 * H-645 dispatch rule shared by `workspace select` / `team select`: interactive
 * prompts only on a TTY with no flags at all; any flag or non-TTY stdin runs
 * the non-interactive path instead.
 */
export function shouldRunInteractive(hasFlags: boolean): boolean {
  const isTty = Boolean(process.stdout.isTTY && process.stdin.isTTY);
  return isTty && !hasFlags;
}

/** Register --project for commands that only use it to widen dir scope (see resolveIssueIdentifier), not as a mutation field. */
export function addProjectScopeOption(cmd: Command): Command {
  return cmd.option(
    '--project <name-or-id>',
    "Project name or ID — widens this directory's scope to include it when resolving the issue id"
  );
}
