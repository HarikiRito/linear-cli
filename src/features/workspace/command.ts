import type { Command } from 'commander';
import { ResultAsync } from 'neverthrow';
import { hasExplicitOutputFlag, isPlain } from '../../lib/commandOptions.js';
import { toError } from '../../lib/errors.js';
import { exitError } from '../../lib/runner.js';
import { runWorkspaceList } from './list.js';
import { runWorkspaceSelect } from './select.js';

export function registerWorkspaceCommand(program: Command): void {
  const workspace = program
    .command('workspace')
    .description('Workspace commands')
    .addHelpCommand(false);

  workspace.action(() => {
    workspace.help();
  });

  const select = workspace
    .command('select')
    .description(
      'Link the current directory to a Linear workspace. Interactive on a TTY with no flags; pass --workspace for scripted/non-interactive use.'
    )
    .option('--workspace <id>', 'Workspace id, urlKey, or name (non-interactive)')
    .option('--team <key>', 'Default team key or name (non-interactive)')
    .option('--projects <names>', 'Comma-separated default project names (non-interactive)')
    .option('--all-projects', "Select all of the team's projects as default (non-interactive)")
    .option('--yes', 'Confirm replacing an existing workspace link without prompting');

  select.action(async (opts) => {
    await ResultAsync.fromPromise(
      runWorkspaceSelect({
        workspace: opts.workspace,
        team: opts.team,
        projects: opts.projects,
        allProjects: opts.allProjects,
        yes: opts.yes,
        plain: isPlain(select),
        explicitOutputFlag: hasExplicitOutputFlag(select),
      }),
      toError
    ).mapErr((e) => exitError(e));
  });

  const list = workspace
    .command('list')
    .description(
      'List stored workspace credentials (id, name, urlKey, auth state). Use --plain for scripting.'
    );

  list.action(async () => {
    await ResultAsync.fromPromise(runWorkspaceList({ plain: isPlain(list) }), toError).mapErr((e) =>
      exitError(e)
    );
  });
}
