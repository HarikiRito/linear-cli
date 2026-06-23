import { ResultAsync } from 'neverthrow';
import { mapLinearError } from '../../../lib/errors.js';
import {
  type ColumnConfig,
  type PageInfo,
  type PagedResult,
  type PaginationOptions,
  type RequestFn,
  fetchOnePage,
  fetchPaged,
  renderPaged,
  runAndRenderPaged,
} from '../../../lib/pagination.js';
export type { RequestFn, PaginationOptions, PageInfo };

export interface TeamNode {
  id: string;
  name: string;
  key: string;
}

export interface TeamRow {
  id: string;
  name: string;
  key: string;
}

export interface TeamsResult {
  teams: TeamRow[];
  pageInfo: PageInfo;
}

export interface TeamConnectionData {
  nodes: TeamNode[];
  pageInfo: PageInfo;
}

export function toTeamRows(nodes: TeamNode[]): TeamRow[] {
  return nodes.map((n) => ({ id: n.id, name: n.name, key: n.key }));
}

function toTeamsResult(r: PagedResult<TeamRow>): TeamsResult {
  return { teams: r.rows, pageInfo: r.pageInfo };
}

// Markdown: ID + Name + Key; TTY omits ID — asymmetry intentional for terminal width.
const TEAM_COLUMNS: ColumnConfig<TeamRow> = {
  headers: ['ID', 'Name', 'Key'],
  toRow: (t) => [t.id, t.name, t.key],
  ttyHeaders: ['Name', 'Key'],
  ttyToRow: (t) => [t.name, t.key],
};

export function fetchPage(
  requestFn: RequestFn,
  query: string,
  variables: Record<string, unknown>
): ResultAsync<TeamsResult, ReturnType<typeof mapLinearError>> {
  return fetchOnePage<TeamNode, TeamRow>(requestFn, query, variables, 'teams', toTeamRows).map(
    toTeamsResult
  );
}

export function fetchTeams(
  requestFn: RequestFn,
  query: string,
  opts: PaginationOptions
): ResultAsync<TeamsResult, ReturnType<typeof mapLinearError>> {
  return fetchPaged<TeamNode, TeamRow>(requestFn, query, {}, 'teams', toTeamRows, opts).map(
    toTeamsResult
  );
}

export function renderTeams(result: TeamsResult, json: boolean): void {
  renderPaged({ rows: result.teams, pageInfo: result.pageInfo }, json, 'teams', TEAM_COLUMNS);
}

export async function runAndRender(
  resultAsync: ResultAsync<TeamsResult, ReturnType<typeof mapLinearError>>,
  json: boolean
): Promise<void> {
  await runAndRenderPaged(
    resultAsync.map((r) => ({ rows: r.teams, pageInfo: r.pageInfo })),
    json,
    'teams',
    TEAM_COLUMNS
  );
}
