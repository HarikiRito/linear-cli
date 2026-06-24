import type { Command } from 'commander';
import { addAuthOptions } from '../../lib/commandOptions.js';
import { listCycles } from './list.js';

export function registerCycles(program: Command): void {
  const cycles = program
    .command('cycles')
    .description('Cycle commands: list')
    .addHelpCommand(false);

  cycles.action(() => {
    cycles.help();
  });

  const listCmd = cycles
    .command('list')
    .description('List cycles for a team (--team required)')
    .requiredOption('--team <key-or-id>', 'Team key or ID')
    .option('--limit <n>', 'Number of cycles per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)')
    .option('--json', 'Output as JSON');

  addAuthOptions(listCmd).action(
    async (opts: {
      team: string;
      limit: string;
      after?: string;
      all?: boolean;
      apiKey?: string;
      token?: string;
      json?: boolean;
    }) => {
      await listCycles({
        apiKey: opts.apiKey,
        token: opts.token,
        team: opts.team,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        all: !!opts.all,
        json: !!opts.json,
      });
    }
  );
}
