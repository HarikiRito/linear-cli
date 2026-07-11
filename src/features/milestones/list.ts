import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../lib/client/index.js';
import { coerceCliError, ValidationError } from '../../lib/errors.js';
import type { PlainField } from '../../lib/output/plain.js';
import {
  type ColumnConfig,
  normalizePageInfo,
  type PagedResult,
  runAndRenderPaged,
} from '../../lib/pagination.js';
import { exitError } from '../../lib/runner.js';
import { buildDefaultProjectFilter } from '../issues/shared/filters.js';
import {
  DEFAULT_PROJECT_REQUIRED_ERROR,
  getDefaultProjectIds,
  resolveProject,
} from '../issues/shared/resolve.js';
import { LIST_PROJECT_MILESTONES_BY_FILTER_QUERY } from './queries.js';

export interface ListMilestonesOptions {
  apiKey?: string;
  token?: string;
  project?: string;
  limit: number;
  after?: string;
  all: boolean;
  plain: boolean;
}

interface MilestoneRow {
  id: string;
  name: string;
  targetDate: string | null;
  description: string | null;
}

function milestonePlainFields(m: MilestoneRow): PlainField[] {
  return [
    { key: 'targetDate', value: m.targetDate },
    { key: 'description', value: m.description },
  ];
}

const MILESTONE_COLUMNS: ColumnConfig<MilestoneRow> = {
  headers: ['Name', 'Target Date'],
  toRow: (m) => [m.name, m.targetDate ?? ''],
  plainType: 'Milestone',
  plainPrimaryId: (m) => m.name,
  toPlainFields: milestonePlainFields,
};

export async function listMilestones(opts: ListMilestonesOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  // Explicit --project always wins (id or name, via resolveProject). When
  // omitted, fall back to an OR/"in" filter across all configured default
  // project IDs — only error when neither is available.
  let explicitProjectId: string | undefined;
  if (opts.project !== undefined) {
    const resolvedResult = await resolveProject(opts.project, client);
    if (resolvedResult.isErr()) {
      exitError(resolvedResult.error);
      return;
    }
    explicitProjectId = resolvedResult.value;
  }
  const filter = buildDefaultProjectFilter(explicitProjectId, getDefaultProjectIds);
  if (!filter) {
    exitError(new ValidationError(DEFAULT_PROJECT_REQUIRED_ERROR));
    return;
  }

  const requestFn = getRequestFn(client);

  const resultAsync = ResultAsync.fromPromise(
    (async (): Promise<PagedResult<MilestoneRow>> => {
      const rows: MilestoneRow[] = [];
      let after: string | undefined = opts.after;
      let pageInfo = normalizePageInfo({ hasNextPage: false, endCursor: null });

      do {
        const data = await requestFn(LIST_PROJECT_MILESTONES_BY_FILTER_QUERY, {
          filter,
          first: opts.limit,
          after,
        });
        const conn = data.projectMilestones;
        for (const n of conn.nodes) {
          rows.push({
            id: n.id,
            name: n.name,
            targetDate: n.targetDate ?? null,
            description: n.description ?? null,
          });
        }
        pageInfo = normalizePageInfo(conn.pageInfo);
        after = conn.pageInfo.endCursor ?? undefined;
      } while (opts.all && pageInfo.hasNextPage);

      return { rows, pageInfo };
    })(),
    coerceCliError
  );

  await runAndRenderPaged(resultAsync, opts.plain, MILESTONE_COLUMNS, 'milestones');
}
