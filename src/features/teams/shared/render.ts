import type { Team } from '@linear/sdk';
import type { ResultAsync } from 'neverthrow';
import type { mapLinearError } from '../../../lib/errors.js';
import type { PlainField } from '../../../lib/output/plain.js';
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

function teamPlainFields(t: TeamRow): PlainField[] {
  return [
    { key: 'id', value: t.id },
    { key: 'key', value: t.key },
  ];
}

const TEAM_COLUMNS: ColumnConfig<TeamRow> = {
  headers: ['Name', 'Key'],
  toRow: (t) => [t.name, t.key],
  plainType: 'Team',
  plainPrimaryId: (t) => t.name,
  toPlainFields: teamPlainFields,
};

export function renderTeams(result: TeamsResult, plain: boolean): void {
  renderPaged(
    { rows: result.teams, pageInfo: result.pageInfo },
    plain,
    TEAM_COLUMNS
  );
}

export async function runAndRender(
  resultAsync: ResultAsync<TeamsResult, ReturnType<typeof mapLinearError>>,
  plain: boolean
): Promise<void> {
  await runAndRenderPaged(
    resultAsync.map((r) => ({ rows: r.teams, pageInfo: r.pageInfo })),
    plain,
    TEAM_COLUMNS
  );
}
