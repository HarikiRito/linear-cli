import { ResultAsync } from 'neverthrow';
import { mapLinearError } from '../../../lib/errors.js';
import { printJson } from '../../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import { exitError } from '../../../lib/runner.js';

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

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface ProjectsResult {
  projects: ProjectRow[];
  pageInfo: PageInfo;
}

export interface ProjectConnectionData {
  nodes: ProjectNode[];
  pageInfo: PageInfo;
}

export type RequestFn = (query: string, vars: Record<string, unknown>) => Promise<unknown>;

export function toProjectRows(nodes: ProjectNode[]): ProjectRow[] {
  return nodes.map((n) => ({ id: n.id, name: n.name, state: n.state }));
}

export function fetchPage(
  requestFn: RequestFn,
  query: string,
  variables: Record<string, unknown>
): ResultAsync<ProjectsResult, ReturnType<typeof mapLinearError>> {
  return ResultAsync.fromPromise(
    requestFn(query, variables).then((data) => {
      const conn = (data as { projects: ProjectConnectionData }).projects;
      return { projects: toProjectRows(conn.nodes), pageInfo: conn.pageInfo };
    }),
    (e) => mapLinearError(e)
  );
}

export interface PaginationOptions {
  all: boolean;
  after?: string;
  limit: number;
}

export function fetchProjects(
  requestFn: RequestFn,
  query: string,
  opts: PaginationOptions
): ResultAsync<ProjectsResult, ReturnType<typeof mapLinearError>> {
  const variables: Record<string, unknown> = {
    first: opts.limit,
    after: opts.after ?? undefined,
  };

  if (!opts.all) {
    return fetchPage(requestFn, query, variables);
  }

  return ResultAsync.fromPromise(
    (async () => {
      const allProjects: ProjectRow[] = [];
      let cursor: string | undefined = opts.after;
      let hasMore = true;
      let lastPageInfo: PageInfo = { hasNextPage: false, endCursor: null };

      while (hasMore) {
        const pageResult = await fetchPage(requestFn, query, { ...variables, after: cursor });
        if (pageResult.isErr()) throw pageResult.error;
        const page = pageResult.value;
        allProjects.push(...page.projects);
        lastPageInfo = page.pageInfo;
        hasMore = page.pageInfo.hasNextPage;
        cursor = page.pageInfo.endCursor ?? undefined;
      }
      return { projects: allProjects, pageInfo: lastPageInfo };
    })(),
    (e) => mapLinearError(e instanceof Error ? e : new Error(String(e)))
  );
}

export function renderProjects(result: ProjectsResult, json: boolean): void {
  const { projects, pageInfo } = result;
  if (json) {
    printJson({ projects, pageInfo });
  } else if (process.stdout.isTTY) {
    const rows = projects.map((p) => [p.name, p.state]);
    printTable(prettyTable(['Name', 'State'], rows));
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      console.log(`\nNext page: --after ${pageInfo.endCursor}`);
    }
  } else {
    const rows = projects.map((p) => [p.id, p.name, p.state]);
    printMarkdown(markdownTable(['ID', 'Name', 'State'], rows));
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      console.log(`\nNext page: --after ${pageInfo.endCursor}`);
    }
  }
}

export async function runAndRender(
  resultAsync: ResultAsync<ProjectsResult, ReturnType<typeof mapLinearError>>,
  json: boolean
): Promise<void> {
  const result = await resultAsync;
  result.match(
    (data) => renderProjects(data, json),
    (e) => exitError(e)
  );
}
