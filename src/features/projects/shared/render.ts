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

export interface ProjectNode {
  id: string;
  name: string;
  state: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  state: string;
}

export interface ProjectsResult {
  projects: ProjectRow[];
  pageInfo: PageInfo;
}

export interface ProjectConnectionData {
  nodes: ProjectNode[];
  pageInfo: PageInfo;
}

export function toProjectRows(nodes: ProjectNode[]): ProjectRow[] {
  return nodes.map((n) => ({ id: n.id, name: n.name, state: n.state }));
}

function toProjectsResult(r: PagedResult<ProjectRow>): ProjectsResult {
  return { projects: r.rows, pageInfo: r.pageInfo };
}

// Markdown: ID + Name + State; TTY omits ID — asymmetry intentional for terminal width.
const PROJECT_COLUMNS: ColumnConfig<ProjectRow> = {
  headers: ['ID', 'Name', 'State'],
  toRow: (p) => [p.id, p.name, p.state],
  ttyHeaders: ['Name', 'State'],
  ttyToRow: (p) => [p.name, p.state],
};

export function fetchPage(
  requestFn: RequestFn,
  query: string,
  variables: Record<string, unknown>
): ResultAsync<ProjectsResult, ReturnType<typeof mapLinearError>> {
  return fetchOnePage<ProjectNode, ProjectRow>(requestFn, query, variables, 'projects', toProjectRows).map(
    toProjectsResult
  );
}

export function fetchProjects(
  requestFn: RequestFn,
  query: string,
  opts: PaginationOptions
): ResultAsync<ProjectsResult, ReturnType<typeof mapLinearError>> {
  return fetchPaged<ProjectNode, ProjectRow>(requestFn, query, {}, 'projects', toProjectRows, opts).map(
    toProjectsResult
  );
}

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
