import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../../lib/errors.js';
import { type ColumnConfig, normalizePageInfo, renderPaged } from '../../../lib/pagination.js';
import { exitError } from '../../../lib/runner.js';
import { resolveProject } from '../../issues/shared/resolve.js';
import { LIST_PROJECT_UPDATES_QUERY } from './queries.js';

export interface ListProjectUpdatesOptions {
  apiKey?: string;
  token?: string;
  project: string;
  limit: number;
  after?: string;
  plain: boolean;
}

interface UpdateRow {
  id: string;
  date: string;
  health: string;
  author: string;
  summary: string;
}

const COLUMNS: ColumnConfig<UpdateRow> = {
  headers: ['ID', 'Date', 'Health', 'Author', 'Summary'],
  toRow: (r) => [r.id, r.date, r.health, r.author, r.summary],
  plainType: 'ProjectUpdate',
  plainPrimaryId: (r) => r.id,
  toPlainFields: (r) => [
    { key: 'date', value: r.date },
    { key: 'health', value: r.health },
    { key: 'author', value: r.author },
    { key: 'summary', value: r.summary },
  ],
};

export async function listProjectUpdates(opts: ListProjectUpdatesOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const projectResult = await resolveProject(opts.project, client);
  if (projectResult.isErr()) {
    exitError(projectResult.error);
    return;
  }
  const projectId = projectResult.value;
  const requestFn = getRequestFn(client);

  const result = await ResultAsync.fromPromise(
    requestFn(LIST_PROJECT_UPDATES_QUERY, {
      projectId,
      first: opts.limit,
      after: opts.after,
    }).then((data) => {
      if (!data.project) throw new NotFoundError('project', opts.project);
      const conn = data.project.projectUpdates;
      return {
        rows: conn.nodes.map((n) => ({
          id: n.id,
          date: n.createdAt,
          health: n.health,
          author: n.user?.name ?? '',
          summary: n.body.split('\n')[0],
        })),
        pageInfo: normalizePageInfo(conn.pageInfo),
      };
    }),
    coerceCliError
  );

  result.match(
    (data) => {
      if (data.rows.length === 0) {
        console.log('No project updates found.');
        return;
      }
      renderPaged(data, opts.plain, COLUMNS);
    },
    (e) => exitError(e)
  );
}
