import type { Command } from 'commander';
import { addAuthOptions, addPlainOption } from '../../../lib/commandOptions.js';
import { getTeam } from './get.js';

export function registerGetCommand(teams: Command): void {
  const cmd = teams
    .command('get <id>')
    .description('Get team detail by name, key, or UUID');

  addAuthOptions(addPlainOption(cmd)).action(
    async (id: string, opts: { apiKey?: string; token?: string; plain?: boolean }) => {
      await getTeam({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        plain: !!opts.plain,
      });
    }
  );
}
