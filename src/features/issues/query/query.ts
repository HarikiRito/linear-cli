import { getClient, getRequestFn } from '../../../lib/client/index.js';
import { exitError } from '../../../lib/runner.js';
import { fetchIssues, runAndRender } from '../shared/render.js';
import { buildStateFilter } from '../shared/stateFilter.js';
import { SEARCH_ISSUES_QUERY } from './queries.js';

export interface QueryOptions {
  apiKey?: string;
  token?: string;
  term: string;
  limit: number;
  after?: string;
  all: boolean;
  json: boolean;
  states: string[];
  allStates: boolean;
}

export async function queryIssues(opts: QueryOptions): Promise<void> {
  // searchIssues accepts filter: IssueFilter — pass state filter server-side.
  const filter = opts.allStates ? undefined : buildStateFilter(opts.states);

  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  await runAndRender(
    fetchIssues(requestFn, SEARCH_ISSUES_QUERY, { term: opts.term, filter }, 'searchIssues', {
      all: opts.all,
      after: opts.after,
      limit: opts.limit,
    }),
    opts.json
  );
}
