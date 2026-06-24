import { getClient, getRequestFn } from '../../../lib/client/index.js';
import { exitError } from '../../../lib/runner.js';
import { type IssueFilterInput, buildFilter } from '../shared/filters.js';
import { fetchIssues, runAndRender } from '../shared/render.js';
import { type StateFilter, buildStateFilter } from '../shared/stateFilter.js';
import { LIST_ISSUES_QUERY } from './queries.js';

export interface ListOptions {
  apiKey?: string;
  token?: string;
  team?: string;
  limit: number;
  after?: string;
  all: boolean;
  json: boolean;
  states: string[];
  allStates: boolean;
}

export async function listIssues(opts: ListOptions): Promise<void> {
  const teamFilter = opts.team ? { team: { key: { eq: opts.team } } } : undefined;
  const stateFilter: StateFilter | undefined = opts.allStates ? undefined : buildStateFilter(opts.states);
  const filter = buildFilter(teamFilter, stateFilter as IssueFilterInput | undefined);

  const baseVariables: Record<string, unknown> = {
    filter: filter ?? undefined,
  };

  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  await runAndRender(
    fetchIssues(requestFn, LIST_ISSUES_QUERY, baseVariables, 'issues', {
      all: opts.all,
      after: opts.after,
      limit: opts.limit,
    }),
    opts.json
  );
}
