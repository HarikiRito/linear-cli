import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { exitError } from '../../../lib/runner.js';
import { buildFilter, type IssueFilterInput } from '../shared/filters.js';
import { fetchIssues, isVisible, runAndRender } from '../shared/render.js';
import { getDefaultTeamId, looksLikeId } from '../shared/resolve.js';
import { buildStateFilter, type StateFilter } from '../shared/stateFilter.js';
import { LIST_ISSUES_QUERY } from './queries.js';

export interface ListOptions {
  apiKey?: string;
  token?: string;
  team?: string;
  limit: number;
  after?: string;
  all: boolean;
  plain: boolean;
  states: string[];
  allStates: boolean;
  includeDeleted: boolean;
}

export async function listIssues(opts: ListOptions): Promise<void> {
  // Resolve team: flag → env/config fallback. Human-readable key is the common
  // case (filtered server-side by key, no extra API round-trip); a UUID/node ID
  // falls back to filtering by team id — see H-162 (key/name first, UUID fallback).
  const effectiveTeam = opts.team ?? getDefaultTeamId() ?? undefined;
  const teamFilter = effectiveTeam
    ? looksLikeId(effectiveTeam)
      ? { team: { id: { eq: effectiveTeam } } }
      : { team: { key: { eq: effectiveTeam } } }
    : undefined;
  const stateFilter: StateFilter | undefined = opts.allStates
    ? undefined
    : buildStateFilter(opts.states);
  const filter = buildFilter(teamFilter, stateFilter as IssueFilterInput | undefined);

  const baseVariables: Record<string, unknown> = {
    filter: filter ?? undefined,
    includeArchived: opts.includeDeleted ? true : undefined,
  };

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  const result = fetchIssues(requestFn, LIST_ISSUES_QUERY, baseVariables, 'issues', {
    all: opts.all,
    after: opts.after,
    limit: opts.limit,
  });

  await runAndRender(
    result.map((r) => ({
      ...r,
      issues: opts.includeDeleted ? r.issues : r.issues.filter(isVisible),
    })),
    opts.plain
  );
}
