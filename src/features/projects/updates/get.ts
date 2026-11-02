import { ResultAsync } from 'neverthrow';
import type { GetProjectUpdateQuery } from '../../../gql/graphql.js';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../../lib/errors.js';
import { renderPlainRecord } from '../../../lib/output/plain.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import { exitError } from '../../../lib/runner.js';
import { GET_PROJECT_UPDATE_QUERY } from './queries.js';

export interface GetProjectUpdateOptions {
  apiKey?: string;
  token?: string;
  id: string;
  plain: boolean;
}

type UpdateNode = GetProjectUpdateQuery['projectUpdate'];

function mapError(e: unknown, id: string) {
  return e instanceof Error && /not found/i.test(e.message) && /project\s*update/i.test(e.message)
    ? new NotFoundError('project update', id)
    : coerceCliError(e);
}

function render(u: UpdateNode, plain: boolean): void {
  if (plain) {
    console.log(
      renderPlainRecord('ProjectUpdate', u.id, [
        { key: 'health', value: u.health },
        { key: 'author', value: u.user?.name ?? '' },
        { key: 'date', value: u.createdAt },
        { key: 'url', value: u.url },
        { key: 'body', value: u.body },
      ])
    );
    return;
  }
  printTable(
    prettyTable(
      ['Field', 'Value'],
      [
        ['ID', u.id],
        ['Health', u.health],
        ['Author', u.user?.name ?? ''],
        ['Date', u.createdAt],
        ['URL', u.url],
      ]
    )
  );
  if (u.body) console.log(`\nBody:\n${u.body}`);
}

export async function getProjectUpdate(opts: GetProjectUpdateOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const requestFn = getRequestFn(clientResult.value);

  const result = await ResultAsync.fromPromise(
    requestFn(GET_PROJECT_UPDATE_QUERY, { id: opts.id }).then((data) => {
      if (!data.projectUpdate) throw new NotFoundError('project update', opts.id);
      return data.projectUpdate;
    }),
    (e) => mapError(e, opts.id)
  );

  result.match(
    (u) => render(u, opts.plain),
    (e) => exitError(e)
  );
}
