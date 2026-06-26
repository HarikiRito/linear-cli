import type { Command } from 'commander';
import { addAuthOptions, addPlainOption } from '../../lib/commandOptions.js';
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
    .option('--all', 'Fetch all pages (one request per page)');

  addAuthOptions(addPlainOption(listCmd)).action(
    async (opts: {
      team?: string;
      limit: string;
      after?: string;
      all?: boolean;
      apiKey?: string;
      token?: string;
      plain?: boolean;
    }) => {
      await listLabels({
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

  const createCmd = labels
    .command('create')
    .description('Create a new issue label')
    .requiredOption('--name <name>', 'Label name')
    .option('--color <hex>', 'Label color as hex string (e.g. #ff0000)')
    .option('--team <key-or-id>', 'Team key or ID (omit for workspace-level label)')
    .option('--description <text>', 'Label description');

  addAuthOptions(addPlainOption(createCmd)).action(
    async (opts: {
      name: string;
      color?: string;
      team?: string;
      description?: string;
      apiKey?: string;
      token?: string;
      plain?: boolean;
    }) => {
      await createLabel({
        apiKey: opts.apiKey,
        token: opts.token,
        name: opts.name,
        color: opts.color,
        team: opts.team,
        description: opts.description,
        plain: !!opts.plain,
      });
    }
  );
}
