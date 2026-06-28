import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../../lib/errors.js';
import { renderPlainList } from '../../../lib/output/plain.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';
import type { IssueHistoryQuery } from '../../../gql/graphql.js';
import { ISSUE_HISTORY_QUERY } from './queries.js';

export const DESCRIPTION_CAVEAT =
  'Note: the API exposes only a changed-flag for description edits — old/new description text is NOT available.';

export interface HistoryOptions {
  apiKey?: string;
  token?: string;
  id: string;
  plain: boolean;
}

type HistoryNode = NonNullable<IssueHistoryQuery['issue']>['history']['nodes'][number];

interface HistoryRow {
  id: string;
  timestamp: string;
  actor: string;
  changes: string;
}

function summarizeChanges(node: HistoryNode): string {
  const parts: string[] = [];

  if (node.updatedDescription) parts.push('description changed (text not available via API)');
  if (node.fromTitle !== null || node.toTitle !== null) {
    parts.push(`title: ${node.fromTitle ?? '?'} → ${node.toTitle ?? '?'}`);
  }
  if (node.fromState !== null || node.toState !== null) {
    parts.push(`state: ${node.fromState?.name ?? '?'} → ${node.toState?.name ?? '?'}`);
  }
  if (node.fromDueDate !== null || node.toDueDate !== null) {
    parts.push(`due: ${node.fromDueDate ?? '(none)'} → ${node.toDueDate ?? '(none)'}`);
  }
  if (node.toConvertedProject !== null) {
    parts.push(`converted to project: ${node.toConvertedProject?.name ?? '?'}`);
  }
  if (node.trashed) parts.push('moved to trash');
  if (node.archived) parts.push('archived');
  if (node.autoArchived) parts.push('auto-archived');
  if (node.autoClosed) parts.push('auto-closed');

  return parts.length > 0 ? parts.join('; ') : '(metadata update)';
}

function renderHistory(rows: HistoryRow[], plain: boolean): void {
  console.log(DESCRIPTION_CAVEAT);

  if (rows.length === 0) {
    console.log('No history events found.');
    return;
  }

  if (plain) {
    console.log(
      renderPlainList(
        'HistoryEvent',
        rows.map((r) => ({
          primaryId: r.id,
          fields: [
            { key: 'timestamp', value: r.timestamp },
            { key: 'actor', value: r.actor },
            { key: 'changes', value: r.changes },
          ],
        }))
      )
    );
    return;
  }

  printTable(
    prettyTable(
      ['Timestamp', 'Actor', 'Changes'],
      rows.map((r) => [r.timestamp, r.actor, r.changes])
    )
  );
}

export async function listHistory(opts: HistoryOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const idResult = await resolveIssueIdentifier(opts.id, client);
  if (idResult.isErr()) {
    exitError(idResult.error);
    return;
  }
  const resolvedId = idResult.value;

  const requestFn = getRequestFn(client);

  const result = await ResultAsync.fromPromise(
    requestFn(ISSUE_HISTORY_QUERY, { id: resolvedId }).then((data) => {
      const issue = data.issue;
      if (!issue) throw new NotFoundError('issue', resolvedId);

      return issue.history.nodes.map((node): HistoryRow => ({
        id: node.id,
        timestamp: node.createdAt,
        actor: node.actors?.length
          ? node.actors.map((a) => a.displayName || a.name).join(', ')
          : 'system',
        changes: summarizeChanges(node),
      }));
    }),
    coerceCliError
  );

  result.match(
    (rows) => renderHistory(rows, opts.plain),
    (e) => exitError(e)
  );
}
