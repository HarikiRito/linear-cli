import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../../lib/errors.js';
import { renderPlainList } from '../../../lib/output/plain.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';
import { LIST_ATTACHMENTS_QUERY } from './queries.js';

export interface ListAttachmentsOptions {
  apiKey?: string;
  token?: string;
  issue: string;
  plain: boolean;
}

export interface AttachmentRow {
  id: string;
  title: string;
  url: string;
}

function renderAttachments(rows: AttachmentRow[], plain: boolean): void {
  if (rows.length === 0) {
    console.log('No attachments found.');
    return;
  }

  if (plain) {
    console.log(
      renderPlainList(
        'Attachment',
        rows.map((r) => ({
          primaryId: r.id,
          fields: [
            { key: 'title', value: r.title },
            { key: 'url', value: r.url },
          ],
        }))
      )
    );
    return;
  }

  printTable(
    prettyTable(
      ['ID', 'Title', 'URL'],
      rows.map((r) => [r.id, r.title, r.url])
    )
  );
}

export async function listAttachments(opts: ListAttachmentsOptions): Promise<void> {
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

  const requestFn = getRequestFn(client);

  const result = await ResultAsync.fromPromise(
    requestFn(LIST_ATTACHMENTS_QUERY, { id: resolvedId }).then((data) => {
      const issue = data.issue;
      if (!issue) throw new NotFoundError('issue', resolvedId);
      return issue.attachments.nodes.map((a) => ({ id: a.id, title: a.title, url: a.url }));
    }),
    coerceCliError
  );

  result.match(
    (rows) => renderAttachments(rows, opts.plain),
    (e) => exitError(e)
  );
}
