import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { deleteIssue } from './delete.js';

export function registerDeleteCommand(issues: Command): void {
  const cmd = issues
    .command('delete <id>')
    .description('Delete an issue (moves to trash)')
    .option('--yes', 'Skip confirmation prompt');

  addAuthOptions(cmd).action(
    async (id: string, opts: { yes?: boolean; apiKey?: string; token?: string }) => {
      await deleteIssue({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        yes: !!opts.yes,
        plain: isPlain(cmd),
      });
    }
  );
}
