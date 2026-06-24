import { getClient, getRequestFn } from '../../lib/client/index.js';
import { type ColumnConfig, fetchPaged, runAndRenderPaged } from '../../lib/pagination.js';
import { exitError } from '../../lib/runner.js';
import { LIST_USERS_QUERY } from './queries.js';

export interface ListUsersOptions {
  apiKey?: string;
  token?: string;
  limit: number;
  after?: string;
  all: boolean;
  json: boolean;
  pretty: boolean;
}

interface UserRow {
  id: string;
  name: string;
  displayName: string;
  email: string;
  active: boolean;
}

const USER_COLUMNS: ColumnConfig<UserRow> = {
  headers: ['ID', 'Name', 'Display Name', 'Email', 'Active'],
  toRow: (u) => [u.id, u.name, u.displayName, u.email, u.active ? 'true' : 'false'],
  ttyHeaders: ['Name', 'Display Name', 'Email', 'Active'],
  ttyToRow: (u) => [u.name, u.displayName, u.email, u.active ? 'yes' : 'no'],
};

function toUserRows(
  nodes: { id: string; name: string; displayName: string; email: string; active: boolean }[]
): UserRow[] {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name,
    displayName: n.displayName,
    email: n.email,
    active: n.active,
  }));
}

export async function listUsers(opts: ListUsersOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  const resultAsync = fetchPaged(requestFn, LIST_USERS_QUERY, {}, 'users', toUserRows, {
    all: opts.all,
    after: opts.after,
    limit: opts.limit,
  });

  await runAndRenderPaged(resultAsync, opts.json, 'users', USER_COLUMNS, 'users', opts.pretty);
}
