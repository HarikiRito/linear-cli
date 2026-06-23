import type { Command } from 'commander';
import { registerListCommand } from './list/command.js';

export function registerProjects(program: Command): void {
  const projects = program
    .command('projects')
    .description('Project commands: list')
    .addHelpCommand(false);

  projects.action(() => {
    projects.help();
  });

  registerListCommand(projects);
}
