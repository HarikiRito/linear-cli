import { getClient, getRequestFn } from '../../lib/client/index.js';
import { ValidationError } from '../../lib/errors.js';
import { type ColumnConfig, fetchPaged, runAndRenderPaged } from '../../lib/pagination.js';
import { exitError } from '../../lib/runner.js';
import { resolveTeam } from '../issues/shared/resolve.js';
import { LIST_STATUSES_QUERY } from './queries.js';

export interface ListStatusesOptions {
  apiKey?: string;
  token?: string;
  team: string;
  limit: number;
  after?: string;
  all: boolean;
  json: boolean;
  pretty: boolean;
}

export interface StatusRow {
  id: string;
  name: string;
  type: string;
  color: string;
  position: number;
}

const STATUS_COLUMNS: ColumnConfig<StatusRow> = {
  headers: ['ID', 'Name', 'Type', 'Color', 'Position'],
  toRow: (s) => [s.id, s.name, s.type, s.color, String(s.position)],
  ttyHeaders: ['Name', 'Type', 'Color'],
  ttyToRow: (s) => [s.name, s.type, s.color],
};

export function toStatusRows(
  nodes: { id: string; name: string; type: string; color: string; position: number }[]
): StatusRow[] {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name,
    type: n.type,
    color: n.color,
    position: n.position,
  }));
}

export async function listStatuses(opts: ListStatusesOptions): Promise<void> {
  if (!opts.team) {
    exitError(new ValidationError('--team is required'));
    return;
  }

  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const resolvedResult = await resolveTeam(opts.team, client);
  if (resolvedResult.isErr()) {
    exitError(resolvedResult.error);
    return;
  }
  const teamId = resolvedResult.value;
  const requestFn = getRequestFn(client);

  const filter = { team: { id: { eq: teamId } } };

  const resultAsync = fetchPaged(
    requestFn,
    LIST_STATUSES_QUERY,
    { filter },
    'workflowStates',
    toStatusRows,
    { all: opts.all, after: opts.after, limit: opts.limit }
  );

  await runAndRenderPaged(resultAsync, opts.json, 'statuses', STATUS_COLUMNS, 'statuses', opts.pretty);
}
