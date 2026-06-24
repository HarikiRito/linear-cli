import { errAsync, okAsync } from 'neverthrow';
import { getClient, getRequestFn } from '../../lib/client/index.js';
import { AmbiguousMatchError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { printJson } from '../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../lib/output/table.js';
import { fetchPaged } from '../../lib/pagination.js';
import { exitError } from '../../lib/runner.js';
import { resolveTeam } from '../issues/shared/resolve.js';
import { type StatusRow, toStatusRows } from './list.js';
import { LIST_STATUSES_QUERY } from './queries.js';

export interface GetStatusOptions {
  apiKey?: string;
  token?: string;
  team: string;
  name?: string;
  id?: string;
  json: boolean;
}

type StatusDetail = StatusRow;

export async function getStatus(opts: GetStatusOptions): Promise<void> {
  if (!opts.name && !opts.id) {
    exitError(new ValidationError('Either --name or --id is required'));
    return;
  }
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

  // If filtering by id, add to filter; otherwise filter by team and then match name
  const filter = opts.id
    ? { team: { id: { eq: teamId } }, id: { eq: opts.id } }
    : { team: { id: { eq: teamId } } };

  const result = await fetchPaged(
    requestFn,
    LIST_STATUSES_QUERY,
    { filter },
    'workflowStates',
    toStatusRows,
    { all: true, limit: 250 }
  ).andThen((pagedResult) => {
    const nodes = pagedResult.rows;

    if (opts.id) {
      const found = nodes.find((n) => n.id === opts.id);
      if (!found) return errAsync(new NotFoundError('status', opts.id ?? ''));
      return okAsync(found);
    }

    // Match by name
    const lower = opts.name?.toLowerCase();
    const matches = nodes.filter((n) => n.name.toLowerCase() === lower);
    if (matches.length === 0) return errAsync(new NotFoundError('status', opts.name ?? ''));
    if (matches.length > 1)
      return errAsync(new AmbiguousMatchError('status', opts.name ?? '', matches));
    return okAsync(matches[0]);
  });

  result.match(
    (status) => renderStatusDetail(status, opts.json),
    (e) => exitError(e)
  );
}

function renderStatusDetail(status: StatusDetail, json: boolean): void {
  if (json) {
    printJson({ status });
    return;
  }

  const rows: [string, string][] = [
    ['ID', status.id],
    ['Name', status.name],
    ['Type', status.type],
    ['Color', status.color],
    ['Position', String(status.position)],
  ];

  if (process.stdout.isTTY) {
    printTable(prettyTable(['Field', 'Value'], rows));
  } else {
    printMarkdown(markdownTable(['Field', 'Value'], rows));
  }
}
