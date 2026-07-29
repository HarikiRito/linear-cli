import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { getProject } from './get.js';

export function registerGetCommand(projects: Command): void {
  const cmd = projects.command('get <id>').description('Get project detail by name or UUID');

  addAuthOptions(cmd).action(async (id: string, opts: { apiKey?: string; token?: string }) => {
    await getProject({
      apiKey: opts.apiKey,
      token: opts.token,
      id,
      plain: isPlain(cmd),
    });
  });
}
