import type { Command } from 'commander';
import { addAuthOptions } from '../../lib/commandOptions.js';
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
    .requiredOption('--project <id-or-name>', 'Project ID or name (required)')
    .option('--limit <n>', 'Number of milestones per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)')
    .option('--json', 'Output as JSON');

  addAuthOptions(listCmd).action(
    async (opts: {
      project: string;
      limit: string;
      after?: string;
      all?: boolean;
      apiKey?: string;
      token?: string;
      json?: boolean;
    }) => {
      await listMilestones({
        apiKey: opts.apiKey,
        token: opts.token,
        project: opts.project,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        all: !!opts.all,
        json: !!opts.json,
      });
    }
  );

  // milestones get
  const getCmd = milestones
    .command('get <id>')
    .description('Get a single milestone by ID')
    .option('--json', 'Output as JSON');

  addAuthOptions(getCmd).action(
    async (id: string, opts: { apiKey?: string; token?: string; json?: boolean }) => {
      await getMilestone({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        json: !!opts.json,
      });
    }
  );

  // milestones create
  const createCmd = milestones
    .command('create')
    .description('Create a new project milestone')
    .requiredOption('--project <id-or-name>', 'Project ID or name (required)')
    .requiredOption('--name <name>', 'Milestone name (required)')
    .option('--target-date <YYYY-MM-DD>', 'Target date for the milestone')
    .option('--description <text>', 'Milestone description')
    .option('--json', 'Output as JSON');

  addAuthOptions(createCmd).action(
    async (opts: {
      project: string;
      name: string;
      targetDate?: string;
      description?: string;
      apiKey?: string;
      token?: string;
      json?: boolean;
    }) => {
      await createMilestone({
        apiKey: opts.apiKey,
        token: opts.token,
        project: opts.project,
        name: opts.name,
        targetDate: opts.targetDate,
        description: opts.description,
        json: !!opts.json,
      });
    }
  );

  // milestones update
  const updateCmd = milestones
    .command('update <id>')
    .description('Update an existing milestone by ID')
    .option('--name <name>', 'New milestone name')
    .option('--target-date <YYYY-MM-DD>', 'New target date')
    .option('--description <text>', 'New description')
    .option('--json', 'Output as JSON');

  addAuthOptions(updateCmd).action(
    async (
      id: string,
      opts: {
        name?: string;
        targetDate?: string;
        description?: string;
        apiKey?: string;
        token?: string;
        json?: boolean;
      }
    ) => {
      await updateMilestone({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        name: opts.name,
        targetDate: opts.targetDate,
        description: opts.description,
        json: !!opts.json,
      });
    }
  );

  // milestones delete
  const deleteCmd = milestones
    .command('delete <id>')
    .description('Delete a milestone by ID')
    .option('--yes', 'Skip confirmation prompt')
    .option('--json', 'Output as JSON');

  addAuthOptions(deleteCmd).action(
    async (
      id: string,
      opts: { yes?: boolean; apiKey?: string; token?: string; json?: boolean }
    ) => {
      await deleteMilestone({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        yes: !!opts.yes,
        json: !!opts.json,
      });
    }
  );
}
