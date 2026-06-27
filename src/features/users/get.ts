import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../lib/errors.js';
import type { PlainField } from '../../lib/output/plain.js';
import { renderPlainRecord } from '../../lib/output/plain.js';
import { prettyTable, printTable } from '../../lib/output/table.js';
import { exitError } from '../../lib/runner.js';
import { GET_USER_QUERY } from './queries.js';

export interface GetUserOptions {
  apiKey?: string;
  token?: string;
  id: string;
  plain: boolean;
}

interface UserDetail {
  id: string;
  name: string;
  displayName: string;
  email: string;
  active: boolean;
  url: string;
  avatarUrl: string | null;
}

export async function getUser(opts: GetUserOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  const result = await ResultAsync.fromPromise(
    requestFn(GET_USER_QUERY, { id: opts.id }).then((data) => {
      const u = data.user;
      if (!u) throw new NotFoundError('user', opts.id);
      return {
        id: u.id,
        name: u.name,
        displayName: u.displayName,
        email: u.email,
        active: u.active,
        url: u.url,
        avatarUrl: u.avatarUrl ?? null,
      } satisfies UserDetail;
    }),
    coerceCliError
  );

  result.match(
    (user) => renderUserDetail(user, opts.plain),
    (e) => exitError(e)
  );
}

function renderUserDetail(user: UserDetail, plain: boolean): void {
  if (plain) {
    const fields: PlainField[] = [
      { key: 'displayName', value: user.displayName },
      { key: 'email', value: user.email },
      { key: 'active', value: user.active ? 'yes' : 'no' },
      { key: 'url', value: user.url },
    ];
    console.log(renderPlainRecord('User', user.name, fields));
    return;
  }

  const rows: [string, string][] = [
    ['Name', user.name],
    ['Display Name', user.displayName],
    ['Email', user.email],
    ['Active', user.active ? 'yes' : 'no'],
    ['URL', user.url],
  ];

  printTable(prettyTable(['Field', 'Value'], rows));
}
