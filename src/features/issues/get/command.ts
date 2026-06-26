import type { Command } from 'commander';
import { addAuthOptions, addPlainOption } from '../../../lib/commandOptions.js';
import { getIssue } from './get.js';

export function registerGetCommand(issues: Command): void {
  const cmd = issues
    .command('get <id>')
    .description('Get full detail for a single issue (identifier like ENG-123 or UUID)');

  addAuthOptions(addPlainOption(cmd)).action(
    async (id: string, opts: { apiKey?: string; token?: string; plain?: boolean }) => {
      await getIssue({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        plain: !!opts.plain,
      });
    }
  );
}
