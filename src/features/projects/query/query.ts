import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { fetchPaged } from '../../../lib/pagination.js';
import { exitError } from '../../../lib/runner.js';
import { resolveSearchTeamId } from '../../issues/shared/resolve.js';
import { type ProjectRow, runAndRender } from '../shared/render.js';
import { SEARCH_PROJECTS_QUERY } from './queries.js';

export interface QueryOptions {
  apiKey?: string;
  token?: string;
  term: string;
  team?: string;
  limit: number;
  after?: string;
  plain: boolean;
  includeComments: boolean;
  includeArchived: boolean;
}

export async function queryProjects(opts: QueryOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const teamResult = await resolveSearchTeamId(opts.team, client);
  if (teamResult.isErr()) {
    exitError(teamResult.error);
    return;
  }

  const result = fetchPaged(
    getRequestFn(client),
    SEARCH_PROJECTS_QUERY,
    {
      term: opts.term,
      teamId: teamResult.value,
      includeComments: opts.includeComments,
      ...(opts.includeArchived && { includeArchived: true }),
    },
    'searchProjects',
    (nodes: ProjectRow[]) => nodes,
    { all: false, after: opts.after, limit: opts.limit }
  );

  await runAndRender(result.map((r) => ({ projects: r.rows, pageInfo: r.pageInfo })), opts.plain);
}
