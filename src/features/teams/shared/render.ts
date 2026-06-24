import type { Team } from '@linear/sdk';
import type { ResultAsync } from 'neverthrow';
import type { mapLinearError } from '../../../lib/errors.js';
import {
  type ColumnConfig,
  type PageInfo,
  renderPaged,
  runAndRenderPaged,
} from '../../../lib/pagination.js';

export interface TeamRow {
  id: string;
  name: string;
  key: string;
}

export interface TeamsResult {
  teams: TeamRow[];
  pageInfo: PageInfo;
}

export function toTeamRows(nodes: Team[]): TeamRow[] {
  return nodes.map((n) => ({ id: n.id, name: n.name, key: n.key }));
}

// Markdown: ID + Name + Key; TTY omits ID — asymmetry intentional for terminal width.
const TEAM_COLUMNS: ColumnConfig<TeamRow> = {
  headers: ['ID', 'Name', 'Key'],
  toRow: (t) => [t.id, t.name, t.key],
  ttyHeaders: ['Name', 'Key'],
  ttyToRow: (t) => [t.name, t.key],
};

export function renderTeams(result: TeamsResult, json: boolean, pretty = false): void {
  renderPaged(
    { rows: result.teams, pageInfo: result.pageInfo },
    json,
    'teams',
    TEAM_COLUMNS,
    undefined,
    pretty
  );
}

export async function runAndRender(
  resultAsync: ResultAsync<TeamsResult, ReturnType<typeof mapLinearError>>,
  json: boolean,
  pretty = false
): Promise<void> {
  await runAndRenderPaged(
    resultAsync.map((r) => ({ rows: r.teams, pageInfo: r.pageInfo })),
    json,
    'teams',
    TEAM_COLUMNS,
    undefined,
    pretty
  );
}
