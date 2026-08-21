import { intro, isCancel, outro, select } from '@clack/prompts';
import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import pc from 'picocolors';
import { buildLinearClient } from '../../lib/client/index.js';
import { toError } from '../../lib/errors.js';
import { listWorkspaceCredentials, writeWorkspaceCredential } from '../auth/credentials.js';
import { authenticateWorkspace } from '../auth/login.js';
import { isApiKeySession, type Session } from '../auth/session.js';
import { mergeGlobalConfig, selectDefaultProjects, selectDefaultTeam } from '../auth/team-select.js';
import { getEntry, linkProject } from '../keepalive/registry.js';

function sessionToCredential(session: Session): { type: 'apiKey' | 'accessToken'; value: string } {
  if (isApiKeySession(session)) return { type: 'apiKey', value: session.apiKey };
  return { type: 'accessToken', value: session.accessToken };
}

interface WorkspaceInfo {
  id: string;
  name: string;
  urlKey: string;
  valid: boolean;
}

/**
 * `linear workspace select` — pick an authenticated workspace (or authenticate
 * a new one), pick a default team, and link the current directory to that
 * workspace + team.
 */
export async function runWorkspaceSelect(): Promise<void> {
  intro(pc.bold('Linear CLI — Select Workspace'));

  const stored = await listWorkspaceCredentials();
  const workspaces: WorkspaceInfo[] = [];

  for (const [id, session] of Object.entries(stored)) {
    const client = buildLinearClient(sessionToCredential(session));
    const orgResult = await ResultAsync.fromPromise(client.organization, toError);
    if (orgResult.isOk()) {
      workspaces.push({
        id,
        name: orgResult.value.name,
        urlKey: orgResult.value.urlKey,
        valid: true,
      });
    } else {
      workspaces.push({ id, name: id, urlKey: '', valid: false });
    }
  }

  const options = [
    ...workspaces.map((w) => ({
      value: w.id,
      label: `${w.name}${w.valid ? '' : pc.yellow(' (invalid — re-auth)')}`,
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
    if (info && !info.valid) {
      // Stored credential is dead — re-auth and overwrite it before linking.
      // Never linkProject against the stale client.
      const auth = await authenticateWorkspace();
      await writeWorkspaceCredential(auth.workspaceId, auth.session);
      workspaceId = auth.workspaceId;
      client = auth.client;
      name = auth.name;
    } else {
      const session = stored[picked];
      if (session) client = buildLinearClient(sessionToCredential(session));
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
  outro(pc.green(`Linked ${cwd} → ${name}${team ? ` (${team.key})` : ''}`));
}
