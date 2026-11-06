import type { Command } from 'commander';
import { registerCreateCommand } from './create/command.js';
import { registerDeleteCommand } from './delete/command.js';
import { registerGetCommand } from './get/command.js';
import { registerLabelsCommand } from './labels/command.js';
import { registerListCommand } from './list/command.js';
import { registerQueryCommand } from './query/command.js';
import { registerUpdateCommand } from './update/command.js';
import { registerUpdatesCommand } from './updates/command.js';

export function registerProjects(program: Command): void {
  const projects = program
    .command('projects')
    .description('Project commands: list, query, get, labels, create, update, delete')
    .addHelpCommand(false);

  projects.action(() => {
    projects.help();
  });

  registerListCommand(projects);
  registerQueryCommand(projects);
  registerGetCommand(projects);
  registerLabelsCommand(projects);
  registerCreateCommand(projects);
  registerUpdateCommand(projects);
  registerUpdatesCommand(projects);
  registerDeleteCommand(projects);
}
