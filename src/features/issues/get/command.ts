import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { getIssue } from './get.js';

export function registerGetCommand(issues: Command): void {
  const cmd = issues
    .command('get <id>')
    .description('Get full detail for a single issue (identifier like ENG-123 or UUID)')
    .option('--json', 'Output as JSON');

  addAuthOptions(cmd).action(
    async (id: string, opts: { apiKey?: string; token?: string; json?: boolean }) => {
      await getIssue({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        json: !!opts.json,
      });
    }
  );
}
