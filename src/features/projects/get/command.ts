import type { Command } from 'commander';
import { addAuthOptions, addJsonOptions } from '../../../lib/commandOptions.js';
import { getProject } from './get.js';

export function registerGetCommand(projects: Command): void {
  const cmd = projects
    .command('get <id>')
    .description('Get project detail by name or UUID');

  addAuthOptions(addJsonOptions(cmd)).action(
    async (id: string, opts: { apiKey?: string; token?: string; json?: boolean; pretty?: boolean }) => {
      await getProject({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        json: !!opts.json,
        pretty: !!opts.pretty,
      });
    }
  );
}
