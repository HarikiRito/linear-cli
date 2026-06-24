import type { Command } from 'commander';
import { addAuthOptions } from '../../lib/commandOptions.js';
import { getStatus } from './get.js';
import { listStatuses } from './list.js';

export function registerStatuses(program: Command): void {
  const statuses = program
    .command('statuses')
    .description('Workflow state commands: list, get')
    .addHelpCommand(false);

  statuses.action(() => {
    statuses.help();
  });

  // statuses list
  const listCmd = statuses
    .command('list')
    .description('List workflow states for a team (--team required)')
    .requiredOption('--team <key-or-id>', 'Team key or ID')
    .option('--limit <n>', 'Number of states per page (default: 50)', '50')
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
      await listStatuses({
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

  // statuses get
  const getCmd = statuses
    .command('get')
    .description('Get a workflow state by --name or --id within a --team')
    .requiredOption('--team <key-or-id>', 'Team key or ID')
    .option('--name <name>', 'Workflow state name')
    .option('--id <id>', 'Workflow state UUID')
    .option('--json', 'Output as JSON');

  addAuthOptions(getCmd).action(
    async (opts: {
      team: string;
      name?: string;
      id?: string;
      apiKey?: string;
      token?: string;
      json?: boolean;
    }) => {
      await getStatus({
        apiKey: opts.apiKey,
        token: opts.token,
        team: opts.team,
        name: opts.name,
        id: opts.id,
        json: !!opts.json,
      });
    }
  );
}
