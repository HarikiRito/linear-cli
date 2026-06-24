import type { Command } from 'commander';
import { addAuthOptions, addJsonOptions } from '../../../lib/commandOptions.js';
import { listTeams } from './list.js';

export function registerListCommand(teams: Command): void {
  const cmd = teams
    .command('list')
    .description('List all teams')
    .option('--limit <n>', 'Number of teams per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)');

  addAuthOptions(addJsonOptions(cmd)).action(async (opts) => {
    await listTeams({
      apiKey: opts.apiKey,
      token: opts.token,
      limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
      after: opts.after,
      all: !!opts.all,
      json: !!opts.json,
      pretty: !!opts.pretty,
    });
  });
}
