import type { Command } from 'commander';
import { addAuthOptions, addPlainOption } from '../../lib/commandOptions.js';
import { getStatus } from './get.js';
import { listStatuses } from './list.js';

export function registerStatuses(program: Command): void {
  const statuses = program
    .command('statuses')
    .description('Workflow status commands: list, get')
    .addHelpCommand(false);

  statuses.action(() => {
    statuses.help();
  });

  // statuses list
  const listCmd = statuses
    .command('list')
    .description('List all workflow statuses for a team')
    .requiredOption('--team <name-or-key>', 'Team name, key, or UUID (required)')
    .option('--limit <n>', 'Number of statuses per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)');

  addAuthOptions(addPlainOption(listCmd)).action(
    async (opts: {
      team: string;
      limit: string;
      after?: string;
      all?: boolean;
      apiKey?: string;
      token?: string;
      plain?: boolean;
    }) => {
      await listStatuses({
        apiKey: opts.apiKey,
        token: opts.token,
        team: opts.team,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        all: !!opts.all,
        plain: !!opts.plain,
      });
    }
  );

  // statuses get
  const getCmd = statuses
    .command('get')
    .description('Get a single status by name or ID')
    .requiredOption('--team <name-or-key>', 'Team name, key, or UUID (required)')
    .option('--name <name>', 'Status name to look up')
    .option('--id <id>', 'Status UUID to look up');

  addAuthOptions(addPlainOption(getCmd)).action(
    async (opts: {
      team: string;
      name?: string;
      id?: string;
      apiKey?: string;
      token?: string;
      plain?: boolean;
    }) => {
      await getStatus({
        apiKey: opts.apiKey,
        token: opts.token,
        team: opts.team,
        name: opts.name,
        id: opts.id,
        plain: !!opts.plain,
      });
    }
  );
}
