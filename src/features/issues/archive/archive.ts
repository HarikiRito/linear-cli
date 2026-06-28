import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { coerceCliError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';

export interface ArchiveOptions {
  apiKey?: string;
  token?: string;
  issue: string;
}

async function toggleArchive(opts: ArchiveOptions, action: 'archive' | 'unarchive'): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const idResult = await resolveIssueIdentifier(opts.issue, client);
  if (idResult.isErr()) {
    exitError(idResult.error);
    return;
  }
  const resolvedId = idResult.value;

  const result = await ResultAsync.fromPromise(
    action === 'archive' ? client.archiveIssue(resolvedId) : client.unarchiveIssue(resolvedId),
    coerceCliError
  );

  result.match(
    () => console.log(`Issue ${opts.issue} ${action}d.`),
    (e) => exitError(e)
  );
}

export async function archiveIssue(opts: ArchiveOptions): Promise<void> {
  return toggleArchive(opts, 'archive');
}

export async function unarchiveIssue(opts: ArchiveOptions): Promise<void> {
  return toggleArchive(opts, 'unarchive');
}
