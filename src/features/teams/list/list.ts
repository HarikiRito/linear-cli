import { getClient } from '../../../lib/client/index.js';
import { exitError } from '../../../lib/runner.js';
import { fetchTeams, runAndRender } from '../shared/render.js';
import { LIST_TEAMS_QUERY } from './queries.js';

export interface ListTeamsOptions {
  apiKey?: string;
  token?: string;
  limit: number;
  after?: string;
  all: boolean;
  json: boolean;
}

export async function listTeams(opts: ListTeamsOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = (client.client as { request: (q: string, v: Record<string, unknown>) => Promise<unknown> }).request.bind(client.client);

  await runAndRender(
    fetchTeams(requestFn, LIST_TEAMS_QUERY, {
      all: opts.all,
      after: opts.after,
      limit: opts.limit,
    }),
    opts.json
  );
}
