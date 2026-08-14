import type { Command } from 'commander';
import { ResultAsync } from 'neverthrow';
import { toError } from '../../lib/errors.js';
import { exitError } from '../../lib/runner.js';
import { runLoginFlow } from './login.js';
import { runLogout } from './logout.js';
import { runTeamSelectFlow } from './team-select-command.js';

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Authenticate with Linear')
    .action(async () => {
      await ResultAsync.fromPromise(runLoginFlow(), toError).mapErr((e) => exitError(e));
    });

  program
    .command('logout')
    .description('Remove stored credentials or unlink this directory')
    .option('--workspace <id>', 'Remove credentials for a specific workspace')
    .option('--all', 'Wipe all workspace credentials')
    .action(async (opts: { workspace?: string; all?: boolean }) => {
      await ResultAsync.fromPromise(
        runLogout({ workspace: opts.workspace, all: opts.all }),
        toError
      ).mapErr((e) => exitError(e));
    });
}

export function registerTeamSelectCommand(program: Command): void {
  const team = program.command('team').description('Team commands').addHelpCommand(false);

  team.action(() => {
    team.help();
  });

  team
    .command('select')
    .description('Interactively select a default team and default projects')
    .action(async () => {
      await ResultAsync.fromPromise(runTeamSelectFlow(), toError).mapErr((e) => exitError(e));
    });
}
