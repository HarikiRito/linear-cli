import { getClient, getRequestFn } from '../../lib/client/index.js';
import { type ColumnConfig, fetchPaged, runAndRenderPaged } from '../../lib/pagination.js';
import { exitError } from '../../lib/runner.js';
import { resolveProject } from '../issues/shared/resolve.js';
import { LIST_DOCUMENTS_QUERY } from './queries.js';

export interface ListDocumentsOptions {
  apiKey?: string;
  token?: string;
  project?: string;
  limit: number;
  after?: string;
  all: boolean;
  json: boolean;
}

interface DocumentRow {
  id: string;
  title: string;
  slugId: string;
  updatedAt: string;
  projectName: string | null;
}

const DOCUMENT_COLUMNS: ColumnConfig<DocumentRow> = {
  headers: ['ID', 'Title', 'Slug', 'Updated At', 'Project'],
  toRow: (d) => [d.id, d.title, d.slugId, d.updatedAt, d.projectName ?? ''],
  ttyHeaders: ['Title', 'Slug', 'Updated At'],
  ttyToRow: (d) => [d.title, d.slugId, d.updatedAt],
};

function toDocumentRows(
  nodes: {
    id: string;
    title: string;
    slugId: string;
    updatedAt: string;
    project?: { id: string; name: string } | null;
  }[]
): DocumentRow[] {
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
    slugId: n.slugId,
    updatedAt: n.updatedAt,
    projectName: n.project?.name ?? null,
  }));
}

export async function listDocuments(opts: ListDocumentsOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  let projectId: string | undefined;
  if (opts.project) {
    const resolvedResult = await resolveProject(opts.project, client);
    if (resolvedResult.isErr()) {
      exitError(resolvedResult.error);
      return;
    }
    projectId = resolvedResult.value;
  }

  const requestFn = getRequestFn(client);

  const filter = projectId ? { project: { id: { eq: projectId } } } : undefined;

  const resultAsync = fetchPaged(
    requestFn,
    LIST_DOCUMENTS_QUERY,
    { filter: filter ?? undefined },
    'documents',
    toDocumentRows,
    { all: opts.all, after: opts.after, limit: opts.limit }
  );

  await runAndRenderPaged(resultAsync, opts.json, 'documents', DOCUMENT_COLUMNS, 'documents');
}
