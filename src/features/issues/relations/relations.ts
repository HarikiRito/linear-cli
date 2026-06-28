import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../../lib/errors.js';
import { renderPlainList } from '../../../lib/output/plain.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';
import { ISSUE_RELATIONS_QUERY } from './queries.js';

export interface RelationsOptions {
  apiKey?: string;
  token?: string;
  id: string;
  plain: boolean;
}

interface RelationRow {
  recordId: string;
  type: string;
  direction: string;
  otherIdentifier: string;
  otherTitle: string;
}

function renderRelations(rows: RelationRow[], plain: boolean): void {
  if (rows.length === 0) {
    console.log('No relations found.');
    return;
  }

  if (plain) {
    console.log(
      renderPlainList(
        'Relation',
        rows.map((r) => ({
          primaryId: r.recordId,
          fields: [
            { key: 'type', value: r.type },
            { key: 'direction', value: r.direction },
            { key: 'issue', value: `${r.otherIdentifier}: ${r.otherTitle}` },
          ],
        }))
      )
    );
    return;
  }

  printTable(
    prettyTable(
      ['Record ID', 'Type', 'Direction', 'Other Issue', 'Title'],
      rows.map((r) => [r.recordId, r.type, r.direction, r.otherIdentifier, r.otherTitle])
    )
  );
}

export async function listRelations(opts: RelationsOptions): Promise<void> {
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
    requestFn(ISSUE_RELATIONS_QUERY, { id: resolvedId }).then((data) => {
      const issue = data.issue;
      if (!issue) throw new NotFoundError('issue', resolvedId);

      const rows: RelationRow[] = [];

      // Parent
      if (issue.parent) {
        rows.push({
          recordId: '(parent)',
          type: 'parent',
          direction: 'parent-of',
          otherIdentifier: issue.parent.identifier,
          otherTitle: issue.parent.title,
        });
      }

      // Children
      for (const child of issue.children.nodes) {
        rows.push({
          recordId: '(child)',
          type: 'parent',
          direction: 'sub-issue-of',
          otherIdentifier: child.identifier,
          otherTitle: child.title,
        });
      }

      // Relations (issue is the source)
      for (const rel of issue.relations.nodes) {
        const other = rel.relatedIssue;
        rows.push({
          recordId: rel.id,
          type: rel.type,
          direction: rel.type === 'blocks' ? 'blocks' : rel.type,
          otherIdentifier: other?.identifier ?? '?',
          otherTitle: other?.title ?? '?',
        });
      }

      // Inverse relations (issue is the target)
      for (const rel of issue.inverseRelations.nodes) {
        const other = rel.issue;
        const direction = rel.type === 'blocks' ? 'blocked-by' : `inverse-${rel.type}`;
        rows.push({
          recordId: rel.id,
          type: rel.type,
          direction,
          otherIdentifier: other?.identifier ?? '?',
          otherTitle: other?.title ?? '?',
        });
      }

      return rows;
    }),
    coerceCliError
  );

  result.match(
    (rows) => renderRelations(rows, opts.plain),
    (e) => exitError(e)
  );
}
