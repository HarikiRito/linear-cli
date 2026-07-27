import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { copyIssue } from './copy.js';

export function registerCopyCommand(issues: Command): void {
  const cmd = issues
    .command('copy <issue>')
    .description(
      'Print the issue URL, identifier, and branch name for scripting.\nWith no flag, all three are printed labeled.\nWith --url/--id/--branch, only that value is printed (unlabeled, suitable for shell substitution).'
    )
    .option('--url', 'Print only the issue URL')
    .option('--id', 'Print only the issue identifier')
    .option('--branch', 'Print only the branch name');

  addAuthOptions(cmd).action(
    async (
      issue: string,
      opts: { url?: boolean; id?: boolean; branch?: boolean; apiKey?: string; token?: string }
    ) => {
      await copyIssue({
        apiKey: opts.apiKey,
        token: opts.token,
        id: issue,
        url: opts.url,
        identifier: opts.id,
        branch: opts.branch,
        plain: isPlain(cmd),
      });
    }
  );
}
