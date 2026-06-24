import type { Project } from '@linear/sdk';
import type { ResultAsync } from 'neverthrow';
import type { mapLinearError } from '../../../lib/errors.js';
import { printJson } from '../../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../../lib/output/markdown.js';
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

// Markdown: ID + Name + State; TTY omits ID — asymmetry intentional for terminal width.
const PROJECT_COLUMNS: ColumnConfig<ProjectRow> = {
  headers: ['ID', 'Name', 'State'],
  toRow: (p) => [p.id, p.name, p.state],
  ttyHeaders: ['Name', 'State'],
  ttyToRow: (p) => [p.name, p.state],
};

export function renderProjects(result: ProjectsResult, json: boolean): void {
  renderPaged(
    { rows: result.projects, pageInfo: result.pageInfo },
    json,
    'projects',
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

export function renderProjectResult(p: ProjectResult, json: boolean): void {
  if (json) {
    printJson({ project: p });
    return;
  }
  const rows: [string, string][] = [
    ['ID', p.id],
    ['Name', p.name],
    ['State', p.state],
    ['URL', p.url],
  ];
  if (process.stdout.isTTY) {
    printTable(prettyTable(['Field', 'Value'], rows));
  } else {
    printMarkdown(markdownTable(['Field', 'Value'], rows));
  }
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
