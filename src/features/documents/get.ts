import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../lib/errors.js';
import type { PlainField } from '../../lib/output/plain.js';
import { renderPlainRecord } from '../../lib/output/plain.js';
import { prettyTable, printTable } from '../../lib/output/table.js';
import { exitError } from '../../lib/runner.js';
import { GET_DOCUMENT_QUERY } from './queries.js';

export interface GetDocumentOptions {
  apiKey?: string;
  token?: string;
  id: string;
  plain: boolean;
}

interface DocumentDetail {
  id: string;
  title: string;
  slugId: string;
  content: string | null;
  updatedAt: string;
  project: { id: string; name: string } | null;
  creator: { id: string; name: string; displayName: string } | null;
}

export async function getDocument(opts: GetDocumentOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  const result = await ResultAsync.fromPromise(
    requestFn(GET_DOCUMENT_QUERY, { id: opts.id }).then((data) => {
      const d = data.document;
      if (!d) throw new NotFoundError('document', opts.id);
      return {
        id: d.id,
        title: d.title,
        slugId: d.slugId,
        content: d.content ?? null,
        updatedAt: d.updatedAt,
        project: d.project ? { id: d.project.id, name: d.project.name } : null,
        creator: d.creator
          ? { id: d.creator.id, name: d.creator.name, displayName: d.creator.displayName }
          : null,
      } satisfies DocumentDetail;
    }),
    coerceCliError
  );

  result.match(
    (doc) => renderDocumentDetail(doc, opts.plain),
    (e) => exitError(e)
  );
}

function renderDocumentDetail(doc: DocumentDetail, plain: boolean): void {
  if (plain) {
    const fields: PlainField[] = [
      { key: 'id', value: doc.id },
      { key: 'slugId', value: doc.slugId },
      { key: 'project', value: doc.project?.name ?? null },
      { key: 'creator', value: doc.creator?.displayName ?? null },
      { key: 'updatedAt', value: doc.updatedAt },
      { key: 'content', value: doc.content },
    ];
    console.log(renderPlainRecord('Document', doc.title, fields));
    return;
  }

  const rows: [string, string][] = [
    ['Title', doc.title],
    ['Slug', doc.slugId],
    ['Project', doc.project?.name ?? ''],
    ['Creator', doc.creator?.displayName ?? ''],
    ['Updated', doc.updatedAt],
  ];

  printTable(prettyTable(['Field', 'Value'], rows));
  if (doc.content) {
    console.log(`\nContent:\n${doc.content}`);
  }
}
