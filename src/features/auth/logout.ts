import { findProjectRoot } from '../../lib/scope.js';
import { getEntry, listProjects, unregisterProject } from '../keepalive/registry.js';
import { deleteWorkspaceCredential, writeCredentialsStore } from './credentials.js';

export interface LogoutOptions {
  /** Remove credentials for exactly this workspace id (and unlink its dirs). */
  workspace?: string;
  /** Wipe the entire credentials store. */
  all?: boolean;
}

/** Count registry entries referencing a workspace id. */
function entriesForWorkspace(workspaceId: string): number {
  return listProjects()
    .unwrapOr([])
    .filter((e) => e.workspace === workspaceId).length;
}

/** Unlink every registry entry pointing at the given workspace. */
function unlinkAll(workspaceId: string): void {
  for (const entry of listProjects().unwrapOr([])) {
    if (entry.workspace === workspaceId) {
      void unregisterProject(entry.root);
    }
  }
}

export async function runLogout(opts: LogoutOptions = {}): Promise<void> {
  if (opts.all) {
    await writeCredentialsStore({ workspaces: {} });
    console.log('Wiped all workspace credentials.');
    return;
  }

  if (opts.workspace) {
    const deleted = await deleteWorkspaceCredential(opts.workspace);
    unlinkAll(opts.workspace);
    console.log(
      deleted
        ? `Removed credentials for workspace ${opts.workspace}.`
        : `No credentials found for workspace ${opts.workspace}.`
    );
    return;
  }

  // Default: unlink the cwd-linked workspace (idempotent).
  const root = findProjectRoot(process.cwd());
  const entry = root ? getEntry(root) : undefined;
  if (!root || !entry?.workspace) {
    console.log('This directory is not linked to a workspace. Nothing to log out.');
    return;
  }

  const workspaceId = entry.workspace;
  void unregisterProject(root);
  if (entriesForWorkspace(workspaceId) === 0) {
    // No other linked directory uses this credential — drop it too.
    const deleted = await deleteWorkspaceCredential(workspaceId);
    console.log(
      deleted
        ? `Logged out: unlinked ${root} and removed the ${workspaceId} credential.`
        : `Unlinked ${root}.`
    );
  } else {
    console.log(`Unlinked ${root} (workspace ${workspaceId} still in use elsewhere).`);
  }
}
