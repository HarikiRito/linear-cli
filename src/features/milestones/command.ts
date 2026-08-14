import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../lib/commandOptions.js';
import { createMilestone } from './create.js';
import { deleteMilestone } from './delete.js';
import { getMilestone } from './get.js';
import { listMilestones } from './list.js';
import { updateMilestone } from './update.js';

export function registerMilestones(program: Command): void {
  const milestones = program
    .command('milestones')
    .description('Project milestone commands: list, get, create, update, delete')
    .addHelpCommand(false);

  milestones.action(() => {
    milestones.help();
  });

  // milestones list
  const listCmd = milestones
    .command('list')
    .description('List milestones for a project')
    .option(
      '--project <id-or-name>',
      'Project ID or name (required, unless a default project is configured — see login)'
    )
    .option('--limit <n>', 'Number of milestones per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)');

  addAuthOptions(listCmd).action(
    async (opts: {
      project?: string;
      limit: string;
      after?: string;
      all?: boolean;
      apiKey?: string;
      token?: string;
    }) => {
      await listMilestones({
        apiKey: opts.apiKey,
        token: opts.token,
        project: opts.project,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        all: !!opts.all,
        plain: isPlain(listCmd),
      });
    }
  );

  // milestones get
  const getCmd = milestones.command('get <id>').description('Get a single milestone by ID');

  addAuthOptions(getCmd).action(async (id: string, opts: { apiKey?: string; token?: string }) => {
    await getMilestone({
      apiKey: opts.apiKey,
      token: opts.token,
      id,
      plain: isPlain(getCmd),
    });
  });

  // milestones create
  const createCmd = milestones
    .command('create')
    .description('Create a new project milestone')
    .option(
      '--project <id-or-name>',
      'Project ID or name (required, unless a default project is configured — see login)'
    )
    .requiredOption('--name <name>', 'Milestone name (required)')
    .option('--target-date <YYYY-MM-DD>', 'Target date for the milestone')
    .option('--description <text>', 'Milestone description');

  addAuthOptions(createCmd).action(
    async (opts: {
      project?: string;
      name: string;
      targetDate?: string;
      description?: string;
      apiKey?: string;
      token?: string;
    }) => {
      await createMilestone({
        apiKey: opts.apiKey,
        token: opts.token,
        project: opts.project,
        name: opts.name,
        targetDate: opts.targetDate,
        description: opts.description,
        plain: isPlain(createCmd),
      });
    }
  );

  // milestones update
  const updateCmd = milestones
    .command('update <id>')
    .description('Update an existing milestone by ID')
    .option('--name <name>', 'New milestone name')
    .option('--target-date <YYYY-MM-DD>', 'New target date')
    .option('--description <text>', 'New description');

  addAuthOptions(updateCmd).action(
    async (
      id: string,
      opts: {
        name?: string;
        targetDate?: string;
        description?: string;
        apiKey?: string;
        token?: string;
      }
    ) => {
      await updateMilestone({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        name: opts.name,
        targetDate: opts.targetDate,
        description: opts.description,
        plain: isPlain(updateCmd),
      });
    }
  );

  // milestones delete
  const deleteCmd = milestones
    .command('delete <id>')
    .description('Delete a milestone by ID')
    .option('--yes', 'Skip confirmation prompt');

  addAuthOptions(deleteCmd).action(
    async (id: string, opts: { yes?: boolean; apiKey?: string; token?: string }) => {
      await deleteMilestone({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        yes: !!opts.yes,
      });
    }
  );
}
