import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { getTeam } from './get.js';

export function registerGetCommand(teams: Command): void {
  const cmd = teams
    .command('get <id>')
    .description('Get team detail by name, key, or UUID')
    .option('--json', 'Output as JSON');

  addAuthOptions(cmd).action(
    async (id: string, opts: { apiKey?: string; token?: string; json?: boolean }) => {
      await getTeam({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        json: !!opts.json,
      });
    }
  );
}
