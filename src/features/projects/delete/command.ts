import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { deleteProject } from './delete.js';

export function registerDeleteCommand(projects: Command): void {
  addAuthOptions(
    projects
      .command('delete <id>')
      .description('Delete a project (moves to trash)')
      .option('--yes', 'Skip confirmation prompt')
  ).action(async (id: string, opts: { yes?: boolean; apiKey?: string; token?: string }) => {
    await deleteProject({
      apiKey: opts.apiKey,
      token: opts.token,
      id,
      yes: !!opts.yes,
    });
  });
}
