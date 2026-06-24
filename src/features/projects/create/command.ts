import type { Command } from 'commander';
import { addAuthOptions, addJsonOptions } from '../../../lib/commandOptions.js';
import { createProject } from './create.js';

export function registerCreateCommand(projects: Command): void {
  const cmd = projects
    .command('create')
    .description('Create a new project')
    .requiredOption('--name <name>', 'Project name')
    .requiredOption('--team <key>', 'Team key or ID to associate the project with')
    .option('--description <text>', 'Project description')
    .option('--lead <name-or-id>', 'Project lead user name or ID (use "me" for yourself)')
    .option('--target-date <YYYY-MM-DD>', 'Planned target date')
    .option('--start-date <YYYY-MM-DD>', 'Planned start date')
    .option('--state <id>', 'Project status ID')
    .option('--status <id>', 'Project status ID (alias for --state)');

  addAuthOptions(addJsonOptions(cmd)).action(
    async (opts: {
      name: string;
      team: string;
      description?: string;
      lead?: string;
      targetDate?: string;
      startDate?: string;
      state?: string;
      status?: string;
      apiKey?: string;
      token?: string;
      json?: boolean;
      pretty?: boolean;
    }) => {
      await createProject({
        apiKey: opts.apiKey,
        token: opts.token,
        name: opts.name,
        team: opts.team,
        description: opts.description,
        lead: opts.lead,
        targetDate: opts.targetDate,
        startDate: opts.startDate,
        state: opts.state ?? opts.status,
        json: !!opts.json,
        pretty: !!opts.pretty,
      });
    }
  );
}
