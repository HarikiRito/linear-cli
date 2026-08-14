import { intro, outro } from '@clack/prompts';
import pc from 'picocolors';
import { buildLinearClient } from '../../lib/client/index.js';
import { ValidationError } from '../../lib/errors.js';
import { findProjectRoot } from '../../lib/scope.js';
import { getEntry } from '../keepalive/registry.js';
import { runLoginFlow } from './login.js';
import { resolveCredential } from './resolve.js';
import { selectAndPersistTeamAndProjects } from './team-select.js';

/**
 * `linear team select` — re-run the team/project default-selection prompts
 * without going through the full login flow. The selected team is written to
 * the cwd's registry entry when the directory is linked to a workspace,
 * otherwise to the global config.toml; projects always go to the global
 * config.
 *
 * When no credential is resolvable, falls back to the full login flow and
 * retries once before failing.
 */
export async function runTeamSelectFlow(): Promise<void> {
  intro(pc.bold('Linear CLI — Select Default Team & Projects'));

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

  const client = buildLinearClient(credResult.value);

  const root = findProjectRoot(process.cwd());
  const entry = root ? getEntry(root) : undefined;
  const target =
    entry?.workspace && root ? { type: 'registry' as const, root } : { type: 'global' as const };

  await selectAndPersistTeamAndProjects(client, target);

  outro(pc.green('Default team/project selection saved.'));
}
