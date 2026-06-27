import type { Command } from 'commander';
import { registerBatchUpdateCommand } from './batch-update/command.js';
import { registerBranchCommand } from './branch/command.js';
import { registerCommentCommand } from './comment/command.js';
import { registerCreateCommand } from './create/command.js';
import { registerDeleteCommand } from './delete/command.js';
import { registerGetCommand } from './get/command.js';
import { registerListCommand } from './list/command.js';
import { registerMeCommand } from './me/command.js';
import { registerQueryCommand } from './query/command.js';
import { registerUpdateCommand } from './update/command.js';

export function registerIssues(program: Command): void {
  const issues = program
    .command('issues')
    .description('Issue commands: list, get, me, query, create, update, batch-update, delete, comment')
    .addHelpCommand(false);

  // Bare `issues` with no subcommand prints help
  issues.action(() => {
    issues.help();
  });

  registerListCommand(issues);
  registerGetCommand(issues);
  registerMeCommand(issues);
  registerQueryCommand(issues);
  registerCommentCommand(issues);
  registerCreateCommand(issues);
  registerUpdateCommand(issues);
  registerBatchUpdateCommand(issues);
  registerDeleteCommand(issues);
  registerBranchCommand(issues);
}
