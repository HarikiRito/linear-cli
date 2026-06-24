import type { Command } from 'commander';
import { addAuthOptions, addJsonOptions } from '../../../lib/commandOptions.js';
import { getTeam } from './get.js';

export function registerGetCommand(teams: Command): void {
  const cmd = teams
    .command('get <id>')
    .description('Get team detail by name, key, or UUID');

  addAuthOptions(addJsonOptions(cmd)).action(
    async (id: string, opts: { apiKey?: string; token?: string; json?: boolean; pretty?: boolean }) => {
      await getTeam({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        json: !!opts.json,
        pretty: !!opts.pretty,
      });
    }
  );
}
