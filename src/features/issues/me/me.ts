import { getClient, getRequestFn } from '../../../lib/client/index.js';
import { exitError } from '../../../lib/runner.js';
import { buildFilter, type IssueFilterInput } from '../shared/filters.js';
import { fetchIssues, runAndRender } from '../shared/render.js';
import { buildStateFilter, type StateFilter } from '../shared/stateFilter.js';
import { ME_ISSUES_QUERY } from './queries.js';

export interface MeOptions {
  apiKey?: string;
  token?: string;
  limit: number;
  after?: string;
  all: boolean;
  json: boolean;
  pretty: boolean;
  states: string[];
  allStates: boolean;
}

export async function myIssues(opts: MeOptions): Promise<void> {
  // Build filter: isMe base filter merged with optional state filter.
  const meBaseFilter: IssueFilterInput = { assignee: { isMe: { eq: true } } };
  const stateFilter: StateFilter | undefined = opts.allStates
    ? undefined
    : buildStateFilter(opts.states);
  const filter = buildFilter(meBaseFilter, stateFilter as IssueFilterInput | undefined);

  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  await runAndRender(
    fetchIssues(requestFn, ME_ISSUES_QUERY, { filter }, 'issues', {
      all: opts.all,
      after: opts.after,
      limit: opts.limit,
    }),
    opts.json,
    opts.pretty
  );
}
