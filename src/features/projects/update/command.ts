import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { updateProject } from './update.js';

export function registerUpdateCommand(projects: Command): void {
  const cmd = projects
    .command('update <id>')
    .description('Update a project by ID or name')
    .option('--name <name>', 'New project name')
    .option('--description <text>', 'New description')
    .option('--lead <name-or-id>', 'New lead user name or ID (use "me" for yourself)')
    .option('--target-date <YYYY-MM-DD>', 'New target date')
    .option('--start-date <YYYY-MM-DD>', 'New start date')
    .option('--state <id>', 'New project status ID')
    .option('--status <id>', 'New project status ID (alias for --state)')
    .option('--json', 'Output as JSON');

  addAuthOptions(cmd).action(
    async (
      id: string,
      opts: {
        name?: string;
        description?: string;
        lead?: string;
        targetDate?: string;
        startDate?: string;
        state?: string;
        status?: string;
        apiKey?: string;
        token?: string;
        json?: boolean;
      }
    ) => {
      await updateProject({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        name: opts.name,
        description: opts.description,
        lead: opts.lead,
        targetDate: opts.targetDate,
        startDate: opts.startDate,
        state: opts.state ?? opts.status,
        json: !!opts.json,
      });
    }
  );
}
