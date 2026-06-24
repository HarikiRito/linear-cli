import { ResultAsync } from 'neverthrow';
import { getClient, getRequestFn } from '../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../lib/errors.js';
import { printJson } from '../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../lib/output/table.js';
import { exitError } from '../../lib/runner.js';
import { GET_USER_QUERY } from './queries.js';

export interface GetUserOptions {
  apiKey?: string;
  token?: string;
  id: string;
  json: boolean;
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
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
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
    (user) => renderUserDetail(user, opts.json),
    (e) => exitError(e)
  );
}

function renderUserDetail(user: UserDetail, json: boolean): void {
  if (json) {
    printJson({ user });
    return;
  }

  const rows: [string, string][] = [
    ['ID', user.id],
    ['Name', user.name],
    ['Display Name', user.displayName],
    ['Email', user.email],
    ['Active', user.active ? 'yes' : 'no'],
    ['URL', user.url],
    ['Avatar', user.avatarUrl ?? ''],
  ];

  if (process.stdout.isTTY) {
    printTable(prettyTable(['Field', 'Value'], rows));
  } else {
    printMarkdown(markdownTable(['Field', 'Value'], rows));
  }
}
