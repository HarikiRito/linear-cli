import { getClientWithAuthRetry, getRequestFn } from '../../lib/client/index.js';
import type { PlainField } from '../../lib/output/plain.js';
import { type ColumnConfig, fetchPaged, runAndRenderPaged } from '../../lib/pagination.js';
import { exitError } from '../../lib/runner.js';
import { LIST_USERS_QUERY } from './queries.js';

export interface ListUsersOptions {
  apiKey?: string;
  token?: string;
  limit: number;
  after?: string;
  all: boolean;
  plain: boolean;
}

interface UserRow {
  id: string;
  name: string;
  displayName: string;
  email: string;
  active: boolean;
}

function userPlainFields(u: UserRow): PlainField[] {
  return [
    { key: 'displayName', value: u.displayName },
    { key: 'email', value: u.email },
    { key: 'active', value: u.active ? 'yes' : 'no' },
  ];
}

const USER_COLUMNS: ColumnConfig<UserRow> = {
  headers: ['Name', 'Display Name', 'Email', 'Active'],
  toRow: (u) => [u.name, u.displayName, u.email, u.active ? 'yes' : 'no'],
  plainType: 'User',
  plainPrimaryId: (u) => u.name,
  toPlainFields: userPlainFields,
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
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
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

  await runAndRenderPaged(resultAsync, opts.plain, USER_COLUMNS, 'users');
}
