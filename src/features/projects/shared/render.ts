import type { Project } from '@linear/sdk';
import type { ResultAsync } from 'neverthrow';
import type { mapLinearError } from '../../../lib/errors.js';
import type { PlainField } from '../../../lib/output/plain.js';
import { renderPlainRecord } from '../../../lib/output/plain.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import {
  type ColumnConfig,
  type PageInfo,
  renderPaged,
  runAndRenderPaged,
} from '../../../lib/pagination.js';

export interface ProjectRow {
  id: string;
  name: string;
  state: string;
}

export interface ProjectsResult {
  projects: ProjectRow[];
  pageInfo: PageInfo;
}

// Project.state is a scalar string in @linear/sdk v22 — no lazy getter needed.
export function toProjectRows(nodes: Project[]): ProjectRow[] {
  return nodes.map((n) => ({ id: n.id, name: n.name, state: n.state }));
}

function projectPlainFields(p: ProjectRow): PlainField[] {
  return [{ key: 'state', value: p.state }];
}

const PROJECT_COLUMNS: ColumnConfig<ProjectRow> = {
  headers: ['Name', 'State'],
  toRow: (p) => [p.name, p.state],
  plainType: 'Project',
  plainPrimaryId: (p) => p.name,
  toPlainFields: projectPlainFields,
};

export function renderProjects(result: ProjectsResult, plain: boolean): void {
  renderPaged(
    { rows: result.projects, pageInfo: result.pageInfo },
    plain,
    PROJECT_COLUMNS
  );
}

/** Shape returned by project create / update mutations. */
export interface ProjectResult {
  id: string;
  name: string;
  state: string;
  url: string;
}

export function renderProjectResult(p: ProjectResult, plain: boolean): void {
  if (plain) {
    console.log(
      renderPlainRecord('Project', p.name, [
        { key: 'id', value: p.id },
        { key: 'state', value: p.state },
        { key: 'url', value: p.url },
      ])
    );
    return;
  }
  const rows: [string, string][] = [
    ['Name', p.name],
    ['State', p.state],
    ['URL', p.url],
  ];
  printTable(prettyTable(['Field', 'Value'], rows));
}

export async function runAndRender(
  resultAsync: ResultAsync<ProjectsResult, ReturnType<typeof mapLinearError>>,
  plain: boolean
): Promise<void> {
  await runAndRenderPaged(
    resultAsync.map((r) => ({ rows: r.projects, pageInfo: r.pageInfo })),
    plain,
    PROJECT_COLUMNS
  );
}
