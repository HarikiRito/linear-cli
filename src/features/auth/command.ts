import type { Command } from 'commander';
import { ResultAsync } from 'neverthrow';
import { isPlain } from '../../lib/commandOptions.js';
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

  const teamSelect = team
    .command('select')
    .description(
      'Select a default team and default projects. Interactive on a TTY with no flags; pass --team for scripted/non-interactive use.'
    )
    .option('--team <key>', 'Team key or name (non-interactive)')
    .option('--projects <names>', 'Comma-separated default project names (non-interactive)')
    .option('--all-projects', "Select all of the team's projects as default (non-interactive)");

  teamSelect.action(async (opts) => {
    await ResultAsync.fromPromise(
      runTeamSelectFlow({
        team: opts.team,
        projects: opts.projects,
        allProjects: opts.allProjects,
        plain: isPlain(teamSelect),
      }),
      toError
    ).mapErr((e) => exitError(e));
  });
}
