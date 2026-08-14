import type { Command } from 'commander';
import { ResultAsync } from 'neverthrow';
import { toError } from '../../lib/errors.js';
import { exitError } from '../../lib/runner.js';
import { runWorkspaceSelect } from './select.js';

export function registerWorkspaceCommand(program: Command): void {
  const workspace = program
    .command('workspace')
    .description('Workspace commands')
    .addHelpCommand(false);

  workspace.action(() => {
    workspace.help();
  });

  workspace
    .command('select')
    .description('Link the current directory to a Linear workspace')
    .action(async () => {
      await ResultAsync.fromPromise(runWorkspaceSelect(), toError).mapErr((e) => exitError(e));
    });
}
