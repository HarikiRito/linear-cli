import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { exitError } from '../../../lib/runner.js';
import { buildFilter, type IssueFilterInput } from '../shared/filters.js';
import { fetchIssues, runAndRender } from '../shared/render.js';
import { getDefaultProjectTeamIds, resolveProject, resolveTeam } from '../shared/resolve.js';
import { buildStateFilter, validateStateTokens } from '../shared/stateFilter.js';
import { SEARCH_ISSUES_QUERY } from './queries.js';

export interface QueryOptions {
  apiKey?: string;
  token?: string;
  term: string;
  project?: string;
  team?: string;
  limit: number;
  after?: string;
  plain: boolean;
  states: string[];
  includeComments: boolean;
  includeArchived: boolean;
}

export async function queryIssues(opts: QueryOptions): Promise<void> {
  const validation = validateStateTokens(opts.states);
  if (validation.isErr()) {
    exitError(validation.error);
    return;
  }

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  let projectFilter: IssueFilterInput | undefined;
  if (opts.project !== undefined) {
    const projectResult = await resolveProject(opts.project, client);
    if (projectResult.isErr()) {
      exitError(projectResult.error);
      return;
    }
    projectFilter = { project: { id: { in: [projectResult.value] } } };
  }

  // Explicit --team wins; with neither flag, scope to the default project's teams.
  let teamIds: string[] = [];
  if (opts.team !== undefined) {
    const teamResult = await resolveTeam(opts.team, client);
    if (teamResult.isErr()) {
      exitError(teamResult.error);
      return;
    }
    teamIds = [teamResult.value];
  } else if (opts.project === undefined) {
    const teamsResult = await getDefaultProjectTeamIds(client);
    if (teamsResult.isErr()) {
      exitError(teamsResult.error);
      return;
    }
    teamIds = teamsResult.value;
  }
  const teamFilter: IssueFilterInput | undefined =
    teamIds.length > 0 ? { team: { id: { in: teamIds } } } : undefined;

  const filter = buildFilter(
    buildFilter(projectFilter, teamFilter),
    buildStateFilter(opts.states) as IssueFilterInput | undefined
  );

  const result = fetchIssues(
    requestFn,
    SEARCH_ISSUES_QUERY,
    {
      term: opts.term,
      filter,
      includeComments: opts.includeComments,
      ...(opts.includeArchived && { includeArchived: true }),
    },
    'searchIssues',
    { all: false, after: opts.after, limit: opts.limit }
  );

  await runAndRender(result, opts.plain);
}
