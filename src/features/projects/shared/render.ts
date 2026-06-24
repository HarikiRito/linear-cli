import type { Project } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { mapLinearError } from '../../../lib/errors.js';
import {
  type ColumnConfig,
  type PageInfo,
  type PagedResult,
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

// Markdown: ID + Name + State; TTY omits ID — asymmetry intentional for terminal width.
const PROJECT_COLUMNS: ColumnConfig<ProjectRow> = {
  headers: ['ID', 'Name', 'State'],
  toRow: (p) => [p.id, p.name, p.state],
  ttyHeaders: ['Name', 'State'],
  ttyToRow: (p) => [p.name, p.state],
};

export function renderProjects(result: ProjectsResult, json: boolean): void {
  renderPaged({ rows: result.projects, pageInfo: result.pageInfo }, json, 'projects', PROJECT_COLUMNS);
}

export async function runAndRender(
  resultAsync: ResultAsync<ProjectsResult, ReturnType<typeof mapLinearError>>,
  json: boolean
): Promise<void> {
  await runAndRenderPaged(
    resultAsync.map((r) => ({ rows: r.projects, pageInfo: r.pageInfo })),
    json,
    'projects',
    PROJECT_COLUMNS
  );
}
