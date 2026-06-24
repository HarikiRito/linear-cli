import { getClient, getRequestFn } from '../../lib/client/index.js';
import { ValidationError } from '../../lib/errors.js';
import { type ColumnConfig, fetchPaged, runAndRenderPaged } from '../../lib/pagination.js';
import { exitError } from '../../lib/runner.js';
import { resolveTeam } from '../issues/shared/resolve.js';
import { LIST_CYCLES_QUERY } from './queries.js';

export interface ListCyclesOptions {
  apiKey?: string;
  token?: string;
  team: string;
  limit: number;
  after?: string;
  all: boolean;
  json: boolean;
  pretty: boolean;
}

interface CycleRow {
  id: string;
  name: string | null;
  number: number;
  startsAt: string;
  endsAt: string;
  completedAt: string | null;
}

const CYCLE_COLUMNS: ColumnConfig<CycleRow> = {
  headers: ['ID', 'Name', 'Number', 'Starts At', 'Ends At', 'Completed At'],
  toRow: (c) => [c.id, c.name ?? '', String(c.number), c.startsAt, c.endsAt, c.completedAt ?? ''],
  ttyHeaders: ['Name', 'Number', 'Starts At', 'Ends At'],
  ttyToRow: (c) => [c.name ?? `#${c.number}`, String(c.number), c.startsAt, c.endsAt],
};

function toCycleRows(
  nodes: {
    id: string;
    name?: string | null;
    number: number;
    startsAt: string;
    endsAt: string;
    completedAt?: string | null;
  }[]
): CycleRow[] {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name ?? null,
    number: n.number,
    startsAt: n.startsAt,
    endsAt: n.endsAt,
    completedAt: n.completedAt ?? null,
  }));
}

export async function listCycles(opts: ListCyclesOptions): Promise<void> {
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

  const resultAsync = fetchPaged(requestFn, LIST_CYCLES_QUERY, { filter }, 'cycles', toCycleRows, {
    all: opts.all,
    after: opts.after,
    limit: opts.limit,
  });

  await runAndRenderPaged(resultAsync, opts.json, 'cycles', CYCLE_COLUMNS, 'cycles', opts.pretty);
}
