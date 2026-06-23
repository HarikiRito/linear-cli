import { ResultAsync } from 'neverthrow';
import { mapLinearError } from '../../../lib/errors.js';
import { printJson } from '../../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import { exitError } from '../../../lib/runner.js';

export interface IssueNode {
  identifier: string;
  title: string;
  state: { name: string } | null;
  assignee: { displayName: string } | null;
}

export interface IssueRow {
  identifier: string;
  title: string;
  state: string;
  assignee: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface IssuesResult {
  issues: IssueRow[];
  pageInfo: PageInfo;
}

export interface IssueQueryData {
  nodes: IssueNode[];
  pageInfo: PageInfo;
}

/** Convert raw GraphQL node data to flat IssueRow objects. */
export function toIssueRows(nodes: IssueNode[]): IssueRow[] {
  return nodes.map((n) => ({
    identifier: n.identifier,
    title: n.title,
    state: n.state?.name ?? '',
    assignee: n.assignee?.displayName ?? '',
  }));
}

/** Shared type for the client.client.request() callable. */
export type RequestFn = (query: string, vars: Record<string, unknown>) => Promise<unknown>;

/**
 * Fetch one page via client.client.request(), extract the connection from
 * `data[rootKey]`, and return a flat IssuesResult.
 */
export function fetchPage(
  requestFn: RequestFn,
  query: string,
  variables: Record<string, unknown>,
  rootKey: string
): ResultAsync<IssuesResult, ReturnType<typeof mapLinearError>> {
  return ResultAsync.fromPromise(
    requestFn(query, variables).then((data) => {
      const conn = (data as Record<string, IssueQueryData>)[rootKey];
      return { issues: toIssueRows(conn.nodes), pageInfo: conn.pageInfo };
    }),
    (e) => mapLinearError(e)
  );
}

export interface PaginationOptions {
  all: boolean;
  after?: string;
  limit: number;
}

/**
 * Run one or all pages of a paginated issues query.
 * Uses client.client.request() — one GraphQL call per page, no per-issue calls.
 */
export function fetchIssues(
  requestFn: RequestFn,
  query: string,
  baseVariables: Record<string, unknown>,
  rootKey: string,
  opts: PaginationOptions
): ResultAsync<IssuesResult, ReturnType<typeof mapLinearError>> {
  const variables = { ...baseVariables, first: opts.limit, after: opts.after ?? undefined };

  if (!opts.all) {
    return fetchPage(requestFn, query, variables, rootKey);
  }

  return ResultAsync.fromPromise(
    (async () => {
      const allIssues: IssueRow[] = [];
      let cursor: string | undefined = opts.after;
      let hasMore = true;
      let lastPageInfo: PageInfo = { hasNextPage: false, endCursor: null };

      while (hasMore) {
        const pageResult = await fetchPage(requestFn, query, { ...variables, after: cursor }, rootKey);
        if (pageResult.isErr()) throw pageResult.error;
        const page = pageResult.value;
        allIssues.push(...page.issues);
        lastPageInfo = page.pageInfo;
        hasMore = page.pageInfo.hasNextPage;
        cursor = page.pageInfo.endCursor ?? undefined;
      }
      return { issues: allIssues, pageInfo: lastPageInfo };
    })(),
    (e) => mapLinearError(e instanceof Error ? e : new Error(String(e)))
  );
}

/** Render and output an IssuesResult to stdout. */
export function renderIssues(result: IssuesResult, json: boolean): void {
  const { issues, pageInfo } = result;
  if (json) {
    printJson({ issues, pageInfo });
  } else if (process.stdout.isTTY) {
    // Pretty table for interactive terminal
    const rows = issues.map((i) => [i.identifier, i.title, i.state, i.assignee]);
    printTable(prettyTable(['Identifier', 'Title', 'State', 'Assignee'], rows));
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      console.log(`\nNext page: --after ${pageInfo.endCursor}`);
    }
  } else {
    // Markdown for piped/non-TTY output
    const rows = issues.map((i) => [i.identifier, i.title, i.state, i.assignee]);
    printMarkdown(markdownTable(['ID', 'Title', 'State', 'Assignee'], rows));
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      console.log(`\nNext page: --after ${pageInfo.endCursor}`);
    }
    console.error(`Showing ${issues.length} issues`);
  }
}

/** Unwrap a ResultAsync<IssuesResult>, render on ok, exitError on err. */
export async function runAndRender(
  resultAsync: ResultAsync<IssuesResult, ReturnType<typeof mapLinearError>>,
  json: boolean
): Promise<void> {
  const result = await resultAsync;
  result.match(
    (data) => renderIssues(data, json),
    (e) => exitError(e)
  );
}
