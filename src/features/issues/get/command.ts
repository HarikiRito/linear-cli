import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { getIssue } from './get.js';

export function registerGetCommand(issues: Command): void {
  const cmd = issues
    .command('get <id>')
    .description('Get full detail for a single issue (identifier like ENG-123 or UUID)')
    .option('--include-deleted', 'Include trashed/archived child/sub-issues (excluded by default)');

  addAuthOptions(cmd).action(
    async (id: string, opts: { apiKey?: string; token?: string; includeDeleted?: boolean }) => {
      await getIssue({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        plain: isPlain(cmd),
        includeDeleted: !!opts.includeDeleted,
      });
    }
  );
}
