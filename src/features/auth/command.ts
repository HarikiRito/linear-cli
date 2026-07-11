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
    .description('Remove stored credentials')
    .action(() => {
      runLogout();
    });
}

export function registerTeamSelectCommand(program: Command): void {
  const team = program.command('team').description('Team commands').addHelpCommand(false);

  team.action(() => {
    team.help();
  });

  team
    .command('select')
    .description(
      'Interactively select a default team and default projects (project scope only)'
    )
    .action(async () => {
      await ResultAsync.fromPromise(runTeamSelectFlow(), toError).mapErr((e) => exitError(e));
    });
}
