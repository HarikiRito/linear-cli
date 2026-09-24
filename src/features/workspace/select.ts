import { intro, isCancel, outro, select } from '@clack/prompts';
import type { LinearClient } from '@linear/sdk';
import pc from 'picocolors';
import { buildLinearClient } from '../../lib/client/index.js';
import { parseCsv, shouldRunInteractive } from '../../lib/commandOptions.js';
import { confirmDestructive } from '../../lib/confirm.js';
import {
  AmbiguousMatchError,
  AuthError,
  NotFoundError,
  ValidationError,
} from '../../lib/errors.js';
import { listWorkspaceCredentials, writeWorkspaceCredential } from '../auth/credentials.js';
import { authenticateWorkspace } from '../auth/login.js';
import {
  mergeGlobalConfig,
  persistLinkedProjects,
  resolveAllTeamProjects,
  resolveTeamByKeyOrName,
  resolveTeamProjectsByName,
  selectDefaultProjects,
  selectDefaultTeam,
} from '../auth/team-select.js';
import { getEntry, linkProject } from '../keepalive/registry.js';
import { resolveWorkspaceStatus, type WorkspaceInfo } from './status.js';

export interface WorkspaceSelectOptions {
  workspace?: string;
  team?: string;
  projects?: string;
  allProjects?: boolean;
  yes?: boolean;
  plain?: boolean;
}

function stateSuffix(state: WorkspaceInfo['state']): string {
  if (state === 'invalid') return pc.yellow(' (invalid — re-auth)');
  if (state === 'unreachable') return pc.yellow(' (unreachable — retry)');
  return '';
}

/**
 * `linear workspace select` — pick an authenticated workspace (or authenticate
 * a new one), pick a default team, and link the current directory to that
 * workspace + team.
 *
 * Runs interactively only on a TTY with no flags at all — matching the
 * pre-H-645 behavior exactly. Any flag, or a non-TTY stdin, runs the
 * non-interactive path instead (see H-645): it never prompts and never opens
 * a browser, failing fast with a usage error when --workspace is missing.
 */
export async function runWorkspaceSelect(opts: WorkspaceSelectOptions = {}): Promise<void> {
  const hasFlags = Boolean(
    opts.workspace || opts.team || opts.projects || opts.allProjects || opts.yes
  );
  if (shouldRunInteractive(hasFlags)) {
    return runWorkspaceSelectInteractive();
  }
  return runWorkspaceSelectNonInteractive(opts);
}

/** The pre-H-645 interactive flow, exported directly so tests don't have to fake a TTY. */
export async function runWorkspaceSelectInteractive(): Promise<void> {
  intro(pc.bold('Linear CLI — Select Workspace'));

  const stored = await listWorkspaceCredentials();
  const workspaces = await Promise.all(
    Object.entries(stored).map(([id, session]) => resolveWorkspaceStatus(id, session))
  );

  const options = [
    ...workspaces.map((w) => ({
      value: w.id,
      label: `${w.name}${stateSuffix(w.state)}`,
    })),
    { value: '__new__', label: 'Authenticate a new workspace' },
  ];

  const picked = await select({ message: 'Select a Linear workspace:', options });
  if (isCancel(picked)) {
    process.exit(0);
  }

  let workspaceId: string;
  let client: LinearClient | undefined;
  let name = '';

  if (picked === '__new__') {
    const auth = await authenticateWorkspace();
    await writeWorkspaceCredential(auth.workspaceId, auth.session);
    workspaceId = auth.workspaceId;
    client = auth.client;
    name = auth.name;
  } else {
    workspaceId = picked;
    const info = workspaces.find((w) => w.id === picked);
    name = info?.name ?? picked;
    if (!info?.credential) {
      // No usable credential (refresh was already attempted, in the listing
      // pass above, and failed permanently) — re-auth and overwrite it before
      // linking. Never link against a dead client.
      const auth = await authenticateWorkspace();
      await writeWorkspaceCredential(auth.workspaceId, auth.session);
      workspaceId = auth.workspaceId;
      client = auth.client;
      name = auth.name;
    } else {
      client = buildLinearClient(info.credential);
    }
  }

  if (!client) {
    outro(pc.red('Authentication failed.'));
    return;
  }

  // Re-link guard: confirm before replacing an existing link to a different workspace.
  const cwd = process.cwd();
  const existing = getEntry(cwd);
  if (existing?.workspace && existing.workspace !== workspaceId) {
    const replace = await select<boolean>({
      message: `This directory is already linked to workspace ${existing.workspace}. Replace it?`,
      options: [
        { value: true, label: 'Yes, re-link' },
        { value: false, label: 'No, keep current link' },
      ],
    });
    if (isCancel(replace) || replace === false) {
      outro(pc.yellow('Link unchanged.'));
      return;
    }
  }

  const team = await selectDefaultTeam(client);
  const projects = team ? await selectDefaultProjects(client, team.id) : undefined;
  if (projects && projects.length > 0) {
    mergeGlobalConfig({ projects });
  }
  await linkProject(cwd, workspaceId, team);
  // Always persist — an empty/undefined selection clears a previously scoped one.
  await persistLinkedProjects(cwd, projects);
  outro(pc.green(`Linked ${cwd} → ${name}${team ? ` (${team.key})` : ''}`));
}

/**
 * Look up a stored workspace by id, urlKey, or name (case-insensitive exact
 * match). Direct id hits skip probing every other stored workspace — no
 * unrelated credential gets refreshed just to resolve one by id.
 */
async function findWorkspace(query: string): Promise<WorkspaceInfo> {
  const stored = await listWorkspaceCredentials();
  if (Object.hasOwn(stored, query)) {
    return resolveWorkspaceStatus(query, stored[query]);
  }

  const candidates = await Promise.all(
    Object.entries(stored).map(([id, session]) => resolveWorkspaceStatus(id, session))
  );
  const lower = query.toLowerCase();
  const matches = candidates.filter(
    (w) => w.urlKey.toLowerCase() === lower || w.name.toLowerCase() === lower
  );
  if (matches.length === 0) {
    const valid = candidates.map((w) => `${w.name} (${w.urlKey || w.id})`).join(', ');
    throw new NotFoundError('workspace', valid ? `${query} — valid: ${valid}` : query);
  }
  if (matches.length > 1) {
    throw new AmbiguousMatchError('workspace', query, matches);
  }
  return matches[0];
}

export async function runWorkspaceSelectNonInteractive(
  opts: WorkspaceSelectOptions
): Promise<void> {
  if (!opts.workspace) {
    throw new ValidationError(
      'Usage: linear workspace select --workspace <id|urlKey|name> [--team <key>] ' +
        '[--projects <name,...> | --all-projects] [--yes]. ' +
        '--workspace is required outside an interactive terminal.'
    );
  }

  const info = await findWorkspace(opts.workspace);

  if (info.state === 'invalid') {
    throw new AuthError(
      `Workspace ${info.name} needs re-authentication (refresh failed). Run \`linear login\` — ` +
        'non-interactive mode never opens a browser.'
    );
  }
  if (!info.credential) {
    throw new AuthError(`Workspace ${info.name} is unreachable right now. Try again shortly.`);
  }

  const client = buildLinearClient(info.credential);
  const workspaceId = info.id;
  const name = info.name;

  const cwd = process.cwd();
  const existing = getEntry(cwd);
  if (existing?.workspace && existing.workspace !== workspaceId) {
    const { proceed, error } = await confirmDestructive(
      `This directory is already linked to workspace ${existing.workspace}. Replace it?`,
      Boolean(opts.yes)
    );
    if (error) throw error;
    if (!proceed) {
      console.log('Link unchanged.');
      return;
    }
  }

  let team: { id: string; key: string } | undefined;
  if (opts.team) {
    const teamResult = await resolveTeamByKeyOrName(opts.team, client);
    if (teamResult.isErr()) throw teamResult.error;
    team = teamResult.value;
  }

  let projects: { id: string; name: string }[] | undefined;
  if (opts.allProjects) {
    if (!team) throw new ValidationError('--all-projects requires --team');
    const projResult = await resolveAllTeamProjects(team.id, client);
    if (projResult.isErr()) throw projResult.error;
    projects = projResult.value;
  } else if (opts.projects) {
    if (!team) throw new ValidationError('--projects requires --team');
    const projResult = await resolveTeamProjectsByName(team.id, parseCsv(opts.projects), client);
    if (projResult.isErr()) throw projResult.error;
    projects = projResult.value;
  }

  await linkProject(cwd, workspaceId, team);
  await persistLinkedProjects(cwd, projects);
  if (projects && projects.length > 0) {
    mergeGlobalConfig({ projects });
  }

  if (opts.plain) {
    // Ticket-mandated exact line set (no type header) — not renderPlainRecord.
    console.log(`root: ${cwd}`);
    console.log(`workspace: ${name}`);
    if (team) console.log(`team: ${team.key}`);
    if (projects && projects.length > 0)
      console.log(`projects: ${projects.map((p) => p.name).join(', ')}`);
  } else {
    console.log(`Linked ${cwd} → ${name}${team ? ` (${team.key})` : ''}`);
  }
}
