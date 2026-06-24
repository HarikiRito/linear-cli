import { ResultAsync } from 'neverthrow';
import { getClient, getRequestFn } from '../../../lib/client/index.js';
import { mapLinearError } from '../../../lib/errors.js';
import {
  type ColumnConfig,
  type PagedResult,
  renderPaged,
} from '../../../lib/pagination.js';
import { exitError } from '../../../lib/runner.js';
import { LIST_COMMENTS_QUERY } from './queries.js';

export interface ListCommentsOptions {
  apiKey?: string;
  token?: string;
  issueId: string;
  limit: number;
  after?: string;
  json: boolean;
}

interface CommentRow {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  thread: string;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

const COLUMNS: ColumnConfig<CommentRow> = {
  headers: ['ID', 'Author', 'Body', 'CreatedAt', 'Thread'],
  toRow: (r) => [r.id, r.author, r.body, r.createdAt, r.thread],
};

export async function listComments(opts: ListCommentsOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  const result: ResultAsync<PagedResult<CommentRow>, ReturnType<typeof mapLinearError>> =
    ResultAsync.fromPromise(
      requestFn(LIST_COMMENTS_QUERY, {
        issueId: opts.issueId,
        first: opts.limit,
        after: opts.after,
      }).then((data) => {
        const nodes = data.issue.comments.nodes;
        const pageInfo = data.issue.comments.pageInfo;
        return {
          rows: nodes.map((n) => ({
            id: n.id,
            author: n.user?.name ?? '',
            body: truncate(n.body, 80),
            createdAt: n.createdAt,
            thread: n.parentId ? `reply to ${n.parentId}` : '',
          })),
          pageInfo: { hasNextPage: pageInfo.hasNextPage, endCursor: pageInfo.endCursor ?? null },
        };
      }),
      (e) => mapLinearError(e)
    );

  const r = await result;
  r.match(
    (data) => renderPaged(data, opts.json, 'comments', COLUMNS),
    (e) => exitError(e)
  );
}
