import { intro, outro } from '@clack/prompts';
import pc from 'picocolors';
import { buildLinearClient } from '../../lib/client/index.js';
import { getProjectConfigPath, readConfigIfExists } from '../../lib/config-file.js';
import { ValidationError } from '../../lib/errors.js';
import { findProjectRoot } from '../../lib/scope.js';
import { runAuthMethodFlow } from './login.js';
import { resolveCredential } from './resolve.js';
import { selectAndPersistTeamAndProjects } from './team-select.js';

/**
 * `linear team select` — re-run the team/project default-selection prompts
 * without going through the full login flow, writing only to the
 * project-scope config.toml. Global-scope config.toml is never read or
 * written by this command.
 *
 * Requires a project-scope config.toml to already exist (created by a prior
 * `linear login` with Project scope) — this command is for refreshing/
 * changing the default team/projects for an already-initialized project, not
 * for bootstrapping one from scratch.
 *
 * When a valid session is already resolvable (project session, global
 * session, or a refreshable OAuth session — see resolveCredential()), all
 * auth and save-scope prompts are skipped and the flow goes straight into
 * team/project selection. Otherwise it falls back to the full oauth/apikey
 * auth flow (skipping only the save-scope prompt, since scope is hardcoded
 * to project here) before proceeding to selection.
 */
export async function runTeamSelectFlow(): Promise<void> {
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    throw new ValidationError(
      'No project-scope config found. Run `linear login` and choose the Project scope first.'
    );
  }

  const configPath = getProjectConfigPath(projectRoot);
  // Read (rather than merely stat) the config to both enforce "must already
  // exist" and obtain the config that will actually be used later — a
  // separate fs.existsSync pre-check would be decoupled from the real read
  // downstream (TOCTOU) and wastefully redundant with it.
  const existingConfig = readConfigIfExists(configPath);
  if (existingConfig === null) {
    throw new ValidationError(
      'No project-scope config found. Run `linear login` and choose the Project scope first.'
    );
  }

  intro(pc.bold('Linear CLI — Select Default Team & Projects'));

  // Never allow resolveCredential() to fall back to its own interactive
  // login prompt here — we handle the no-session fallback ourselves so we
  // can hardcode scope to 'project' and skip the save-scope prompt.
  // projectRoot is passed through so resolveCredential() doesn't redo the
  // same findProjectRoot(process.cwd()) directory walk we already did above.
  const credResult = await resolveCredential({ allowInteractive: false, projectRoot });

  const client = credResult.isOk()
    ? buildLinearClient(credResult.value)
    : await runAuthMethodFlow('project', projectRoot);

  if (!client) {
    outro(pc.red('Authentication failed.'));
    return;
  }

  await selectAndPersistTeamAndProjects(client, configPath, existingConfig);

  outro(pc.green('Default team/project selection saved.'));
}
