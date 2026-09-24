import { renderPlainList } from '../../lib/output/plain.js';
import { prettyTable, printTable } from '../../lib/output/table.js';
import { listWorkspaceCredentials } from '../auth/credentials.js';
import { resolveWorkspaceStatus } from './status.js';

export interface WorkspaceListOptions {
  plain: boolean;
}

/**
 * `linear workspace list` — list every stored workspace credential (id, name,
 * urlKey, auth state). Never links a directory or opens a browser, but — like
 * every other command — an expired OAuth token is transparently refreshed and
 * its rotation written back (see H-642); this is a local credential-store
 * write, not a Linear API mutation. See H-645: this is what lets a
 * non-interactive `workspace select --workspace <id>` be scripted without
 * first running the interactive picker.
 */
export async function runWorkspaceList(opts: WorkspaceListOptions): Promise<void> {
  const stored = await listWorkspaceCredentials();
  const statuses = await Promise.all(
    Object.entries(stored).map(([id, session]) => resolveWorkspaceStatus(id, session))
  );

  if (opts.plain) {
    console.log(
      renderPlainList(
        'Workspace',
        statuses.map((w) => ({
          primaryId: w.id,
          fields: [
            { key: 'name', value: w.name },
            { key: 'urlKey', value: w.urlKey || null },
            { key: 'state', value: w.state },
          ],
        }))
      )
    );
    return;
  }

  if (statuses.length === 0) {
    console.log('No stored workspaces. Run `linear login` to authenticate one.');
    return;
  }

  printTable(
    prettyTable(
      ['ID', 'Name', 'URL Key', 'State'],
      statuses.map((w) => [w.id, w.name, w.urlKey, w.state])
    )
  );
}
