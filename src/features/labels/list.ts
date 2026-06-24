import { getClient, getRequestFn } from '../../lib/client/index.js';
import { type ColumnConfig, fetchPaged, runAndRenderPaged } from '../../lib/pagination.js';
import { exitError } from '../../lib/runner.js';
import { resolveTeam } from '../issues/shared/resolve.js';
import { LIST_LABELS_QUERY } from './queries.js';

export interface ListLabelsOptions {
  apiKey?: string;
  token?: string;
  team?: string;
  limit: number;
  after?: string;
  all: boolean;
  json: boolean;
}

interface LabelRow {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
}

const LABEL_COLUMNS: ColumnConfig<LabelRow> = {
  headers: ['ID', 'Name', 'Color', 'Parent ID'],
  toRow: (l) => [l.id, l.name, l.color, l.parentId ?? ''],
  ttyHeaders: ['Name', 'Color'],
  ttyToRow: (l) => [l.name, l.color],
};

function toLabelRows(
  nodes: { id: string; name: string; color: string; parent?: { id: string } | null }[]
): LabelRow[] {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name,
    color: n.color,
    parentId: n.parent?.id ?? null,
  }));
}

export async function listLabels(opts: ListLabelsOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  let teamId: string | undefined;
  if (opts.team) {
    const resolvedResult = await resolveTeam(opts.team, client);
    if (resolvedResult.isErr()) {
      exitError(resolvedResult.error);
      return;
    }
    teamId = resolvedResult.value;
  }

  const requestFn = getRequestFn(client);

  const filter = teamId ? { team: { id: { eq: teamId } } } : undefined;

  const resultAsync = fetchPaged(
    requestFn,
    LIST_LABELS_QUERY,
    { filter: filter ?? undefined },
    'issueLabels',
    toLabelRows,
    { all: opts.all, after: opts.after, limit: opts.limit }
  );

  await runAndRenderPaged(resultAsync, opts.json, 'labels', LABEL_COLUMNS, 'labels');
}
