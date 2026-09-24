import { intro, outro } from '@clack/prompts';
import type { LinearClient } from '@linear/sdk';
import pc from 'picocolors';
import { buildLinearClient } from '../../lib/client/index.js';
import { parseCsv, shouldRunInteractive } from '../../lib/commandOptions.js';
import type { DefaultProject } from '../../lib/config-file.js';
import { ValidationError } from '../../lib/errors.js';
import { findProjectRoot } from '../../lib/scope.js';
import { getEntry, updateEntry } from '../keepalive/registry.js';
import { runLoginFlow } from './login.js';
import { resolveCredential } from './resolve.js';
import {
  mergeGlobalConfig,
  resolveAllTeamProjects,
  resolveTeamByKeyOrName,
  resolveTeamProjectsByName,
  selectAndPersistTeamAndProjects,
  type TeamPersistTarget,
} from './team-select.js';

export interface TeamSelectOptions {
  team?: string;
  projects?: string;
  allProjects?: boolean;
  plain?: boolean;
}

/**
 * `linear team select` — re-run the team/project default-selection prompts
 * without going through the full login flow.
 *
 * Runs interactively only on a TTY with no flags at all — matching the
 * pre-H-645 behavior exactly. Any flag, or a non-TTY stdin, runs the
 * non-interactive path instead (see H-645): it never prompts, failing fast
 * with a usage error when --team is missing.
 */
export async function runTeamSelectFlow(opts: TeamSelectOptions = {}): Promise<void> {
  const hasFlags = Boolean(opts.team || opts.projects || opts.allProjects || opts.plain);
  if (shouldRunInteractive(hasFlags)) {
    return runTeamSelectInteractive();
  }
  return runTeamSelectNonInteractive(opts);
}

/**
 * The pre-H-645 interactive flow, exported directly so tests don't have to
 * fake a TTY. The selected team is written to the cwd's registry entry when
 * the directory is linked to a workspace, otherwise to the global
 * config.toml; projects always go to the global config.
 *
 * When no credential is resolvable, falls back to the full login flow and
 * retries once before failing.
 */
export async function runTeamSelectInteractive(): Promise<void> {
  intro(pc.bold('Linear CLI — Select Default Team & Projects'));

  const client = await resolveClientOrLogin();

  const root = findProjectRoot(process.cwd());
  const entry = root ? getEntry(root) : undefined;
  const target =
    entry?.workspace && root ? { type: 'registry' as const, root } : { type: 'global' as const };

  await selectAndPersistTeamAndProjects(client, target);

  outro(pc.green('Default team/project selection saved.'));
}

async function resolveClientOrLogin(): Promise<LinearClient> {
  let credResult = await resolveCredential({ allowInteractive: false });
  if (credResult.isErr()) {
    // No credential available — go through login, then retry once.
    await runLoginFlow();
    credResult = await resolveCredential({ allowInteractive: false });
  }

  if (credResult.isErr()) {
    const root = findProjectRoot(process.cwd());
    const entry = root ? getEntry(root) : undefined;
    throw new ValidationError(
      entry?.workspace
        ? 'Authentication failed. Run `linear login` to re-authenticate.'
        : 'No linked workspace or saved credentials. Run `linear login` or `linear workspace select` first.'
    );
  }

  return buildLinearClient(credResult.value);
}

export async function runTeamSelectNonInteractive(opts: TeamSelectOptions): Promise<void> {
  if (!opts.team) {
    throw new ValidationError(
      'Usage: linear team select --team <key|name> [--projects <name,...> | --all-projects]. ' +
        '--team is required outside an interactive terminal.'
    );
  }

  const client = await resolveClientOrLogin();

  const teamResult = await resolveTeamByKeyOrName(opts.team, client);
  if (teamResult.isErr()) throw teamResult.error;
  const team = teamResult.value;

  let projects: DefaultProject[] | undefined;
  if (opts.allProjects) {
    const projResult = await resolveAllTeamProjects(team.id, client);
    if (projResult.isErr()) throw projResult.error;
    projects = projResult.value;
  } else if (opts.projects) {
    const projResult = await resolveTeamProjectsByName(team.id, parseCsv(opts.projects), client);
    if (projResult.isErr()) throw projResult.error;
    projects = projResult.value;
  }

  const root = findProjectRoot(process.cwd());
  const entry = root ? getEntry(root) : undefined;
  const target: TeamPersistTarget =
    entry?.workspace && root ? { type: 'registry', root } : { type: 'global' };

  if (target.type === 'registry') {
    const updateResult = await updateEntry(target.root, { team });
    if (updateResult.isErr()) {
      console.error(
        pc.yellow(`Warning: could not update registry entry: ${updateResult.error.message}`)
      );
    }
  }
  mergeGlobalConfig(target.type === 'global' ? { team, projects } : { projects });

  if (opts.plain) {
    // Same ticket-mandated line-set format as `workspace select` — not renderPlainRecord.
    console.log(`team: ${team.key}`);
    if (projects && projects.length > 0) {
      console.log(`projects: ${projects.map((p) => p.name).join(', ')}`);
    }
  } else {
    const projSuffix =
      projects && projects.length > 0
        ? ` (projects: ${projects.map((p) => p.name).join(', ')})`
        : '';
    console.log(`Default team set to ${team.key}${projSuffix}.`);
  }
}
