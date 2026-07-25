import pc from 'picocolors';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { exitError } from '../../../lib/runner.js';
import {
  buildDefaultProjectFilter,
  buildFilter,
  type IssueFilterInput,
} from '../shared/filters.js';
import { fetchIssues, runAndRender } from '../shared/render.js';
import { getDefaultProjectIds, resolveProject } from '../shared/resolve.js';
import { buildStateFilter } from '../shared/stateFilter.js';
import { SEARCH_ISSUES_QUERY } from './queries.js';
import { filterByTermRelevance } from './relevance.js';

export interface QueryOptions {
  apiKey?: string;
  token?: string;
  term: string;
  project?: string;
  limit: number;
  after?: string;
  all: boolean;
  plain: boolean;
  states: string[];
  allStates: boolean;
}

export async function queryIssues(opts: QueryOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  // searchIssues accepts filter: IssueFilter — pass state filter server-side.
  const stateFilter = opts.allStates ? undefined : buildStateFilter(opts.states);

  // Resolve project: explicit --project always wins (id or name, via
  // resolveProject). When omitted, fall back to an OR/"in" filter across all
  // configured default project IDs.
  let explicitProjectId: string | undefined;
  if (opts.project !== undefined) {
    const projectResult = await resolveProject(opts.project, client);
    if (projectResult.isErr()) {
      exitError(projectResult.error);
      return;
    }
    explicitProjectId = projectResult.value;
  }
  const projectFilter: IssueFilterInput | undefined = buildDefaultProjectFilter(
    explicitProjectId,
    getDefaultProjectIds
  );

  const filter = buildFilter(stateFilter as IssueFilterInput | undefined, projectFilter);

  // see relevance.ts for why client-side filtering is needed here
  const result = fetchIssues(
    requestFn,
    SEARCH_ISSUES_QUERY,
    { term: opts.term, filter },
    'searchIssues',
    {
      all: opts.all,
      after: opts.after,
      limit: opts.limit,
    }
  ).map((r) => {
    const filtered = filterByTermRelevance(r.issues, opts.term);
    // pageInfo is passed through unchanged from the raw (unfiltered) page, so
    // when relevance filtering drops rows from a limited (non --all) page,
    // warn the user rather than silently showing a truncated-looking result.
    if (!opts.all && filtered.length < r.issues.length) {
      const removed = r.issues.length - filtered.length;
      console.error(
        pc.yellow(
          `Filtered ${removed} of ${r.issues.length} results by relevance; use --all to see more.`
        )
      );
    }
    return { ...r, issues: filtered };
  });

  await runAndRender(result, opts.plain);
}
