import type { Command } from 'commander';
import { registerListCommand } from './list/command.js';
import { registerMeCommand } from './me/command.js';
import { registerQueryCommand } from './query/command.js';

export function registerIssues(program: Command): void {
  const issues = program
    .command('issues')
    .description('Issue commands: list, me, query')
    .addHelpCommand(false);

  // Bare `issues` with no subcommand prints help
  issues.action(() => {
    issues.help();
  });

  registerListCommand(issues);
  registerMeCommand(issues);
  registerQueryCommand(issues);
}
