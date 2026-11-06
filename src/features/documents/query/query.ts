import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { fetchPaged, runAndRenderPaged } from '../../../lib/pagination.js';
import { exitError } from '../../../lib/runner.js';
import { resolveSearchTeamId } from '../../issues/shared/resolve.js';
import { DOCUMENT_COLUMNS, toDocumentRows } from '../list.js';
import { SEARCH_DOCUMENTS_QUERY } from './queries.js';

export interface QueryOptions {
  apiKey?: string;
  token?: string;
  term: string;
  team?: string;
  limit: number;
  after?: string;
  plain: boolean;
  includeComments: boolean;
  includeArchived: boolean;
}

export async function queryDocuments(opts: QueryOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const teamResult = await resolveSearchTeamId(opts.team, client);
  if (teamResult.isErr()) {
    exitError(teamResult.error);
    return;
  }

  const result = fetchPaged(
    getRequestFn(client),
    SEARCH_DOCUMENTS_QUERY,
    {
      term: opts.term,
      teamId: teamResult.value,
      includeComments: opts.includeComments,
      ...(opts.includeArchived && { includeArchived: true }),
    },
    'searchDocuments',
    toDocumentRows,
    { all: false, after: opts.after, limit: opts.limit }
  );

  await runAndRenderPaged(result, opts.plain, DOCUMENT_COLUMNS, 'documents');
}
