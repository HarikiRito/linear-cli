import type { Command } from 'commander';
import { addAuthOptions, addJsonOptions } from '../../../lib/commandOptions.js';
import { getIssue } from './get.js';

export function registerGetCommand(issues: Command): void {
  const cmd = issues
    .command('get <id>')
    .description('Get full detail for a single issue (identifier like ENG-123 or UUID)');

  addAuthOptions(addJsonOptions(cmd)).action(
    async (id: string, opts: { apiKey?: string; token?: string; json?: boolean; pretty?: boolean }) => {
      await getIssue({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        json: !!opts.json,
        pretty: !!opts.pretty,
      });
    }
  );
}
