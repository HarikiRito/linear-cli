import type { Command } from 'commander';
import { addAuthOptions, addPlainOption } from '../../../lib/commandOptions.js';
import { getProject } from './get.js';

export function registerGetCommand(projects: Command): void {
  const cmd = projects
    .command('get <id>')
    .description('Get project detail by name or UUID');

  addAuthOptions(addPlainOption(cmd)).action(
    async (id: string, opts: { apiKey?: string; token?: string; plain?: boolean }) => {
      await getProject({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        plain: !!opts.plain,
      });
    }
  );
}
