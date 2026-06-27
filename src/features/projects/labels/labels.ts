import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, NotFoundError, ValidationError } from '../../../lib/errors.js';
import {
  type ColumnConfig,
  normalizePageInfo,
  type PagedResult,
  type PageInfo,
  runAndRenderPaged,
} from '../../../lib/pagination.js';
import { exitError } from '../../../lib/runner.js';
import { resolveProject } from '../../issues/shared/resolve.js';
import { PROJECT_LABELS_QUERY } from './queries.js';

export interface ListProjectLabelsOptions {
  apiKey?: string;
  token?: string;
  project: string;
  limit: number;
  after?: string;
  all: boolean;
  plain: boolean;
}

interface LabelRow {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
}

const LABEL_COLUMNS: ColumnConfig<LabelRow> = {
  headers: ['Name', 'Color'],
  toRow: (l) => [l.name, l.color],
  plainType: 'Label',
  plainPrimaryId: (l) => l.name,
  toPlainFields: (l) => [{ key: 'color', value: l.color }],
};

function toRows(
  nodes: { id: string; name: string; color: string; parent?: { id: string } | null }[]
): LabelRow[] {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name,
    color: n.color,
    parentId: n.parent?.id ?? null,
  }));
}

export async function listProjectLabels(opts: ListProjectLabelsOptions): Promise<void> {
  if (!opts.project) {
    exitError(new ValidationError('--project is required'));
    return;
  }

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const resolvedResult = await resolveProject(opts.project, client);
  if (resolvedResult.isErr()) {
    exitError(resolvedResult.error);
    return;
  }
  const projectId = resolvedResult.value;
  const requestFn = getRequestFn(client);

  const resultAsync = ResultAsync.fromPromise(
    (async (): Promise<PagedResult<LabelRow>> => {
      const baseVars = {
        id: projectId,
        first: opts.limit,
        after: opts.after ?? undefined,
      };

      if (!opts.all) {
        const data = await requestFn(PROJECT_LABELS_QUERY, baseVars);
        if (!data.project) throw new NotFoundError('project', opts.project);
        const conn = data.project.labels;
        return { rows: toRows(conn.nodes), pageInfo: normalizePageInfo(conn.pageInfo) };
      }

      let allRows: LabelRow[] = [];
      let cursor: string | undefined = opts.after;
      let lastPageInfo: PageInfo = { hasNextPage: false, endCursor: null };

      do {
        const data = await requestFn(PROJECT_LABELS_QUERY, { ...baseVars, after: cursor });
        if (!data.project) throw new NotFoundError('project', opts.project);
        const conn = data.project.labels;
        allRows = allRows.concat(toRows(conn.nodes));
        lastPageInfo = normalizePageInfo(conn.pageInfo);
        cursor =
          conn.pageInfo.hasNextPage && conn.pageInfo.endCursor
            ? conn.pageInfo.endCursor
            : undefined;
      } while (cursor !== undefined);

      return { rows: allRows, pageInfo: lastPageInfo };
    })(),
    coerceCliError
  );

  await runAndRenderPaged(resultAsync, opts.plain, LABEL_COLUMNS, 'labels');
}
