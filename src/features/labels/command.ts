import type { Command } from 'commander';
import { addAuthOptions } from '../../lib/commandOptions.js';
import { createLabel } from './create.js';
import { listLabels } from './list.js';

export function registerLabels(program: Command): void {
  const labels = program
    .command('labels')
    .description('Label commands: list, create')
    .addHelpCommand(false);

  labels.action(() => {
    labels.help();
  });

  const listCmd = labels
    .command('list')
    .description('List issue labels (optionally scoped to a team)')
    .option('--team <key-or-id>', 'Filter by team key or ID')
    .option('--limit <n>', 'Number of labels per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)')
    .option('--json', 'Output as JSON');

  addAuthOptions(listCmd).action(
    async (opts: {
      team?: string;
      limit: string;
      after?: string;
      all?: boolean;
      apiKey?: string;
      token?: string;
      json?: boolean;
    }) => {
      await listLabels({
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

  const createCmd = labels
    .command('create')
    .description('Create a new issue label')
    .requiredOption('--name <name>', 'Label name')
    .option('--color <hex>', 'Label color as hex string (e.g. #ff0000)')
    .option('--team <key-or-id>', 'Team key or ID (omit for workspace-level label)')
    .option('--description <text>', 'Label description')
    .option('--json', 'Output as JSON');

  addAuthOptions(createCmd).action(
    async (opts: {
      name: string;
      color?: string;
      team?: string;
      description?: string;
      apiKey?: string;
      token?: string;
      json?: boolean;
    }) => {
      await createLabel({
        apiKey: opts.apiKey,
        token: opts.token,
        name: opts.name,
        color: opts.color,
        team: opts.team,
        description: opts.description,
        json: !!opts.json,
      });
    }
  );
}
