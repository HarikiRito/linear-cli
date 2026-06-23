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

/** Map a PagedResult<IssueRow> back to the legacy IssuesResult shape. */
function toIssuesResult(r: PagedResult<IssueRow>): IssuesResult {
  return { issues: r.rows, pageInfo: r.pageInfo };
}

const ISSUE_COLUMNS: ColumnConfig<IssueRow> = {
  headers: ['ID', 'Title', 'State', 'Assignee'],
  toRow: (i) => [i.identifier, i.title, i.state, i.assignee],
};

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
  return fetchOnePage<IssueNode, IssueRow>(requestFn, query, variables, rootKey, toIssueRows).map(
    toIssuesResult
  );
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
  return fetchPaged<IssueNode, IssueRow>(
    requestFn,
    query,
    baseVariables,
    rootKey,
    toIssueRows,
    opts
  ).map(toIssuesResult);
}

/** Render and output an IssuesResult to stdout. */
export function renderIssues(result: IssuesResult, json: boolean): void {
  renderPaged(
    { rows: result.issues, pageInfo: result.pageInfo },
    json,
    'issues',
    ISSUE_COLUMNS,
    'issues'
  );
}

/** Unwrap a ResultAsync<IssuesResult>, render on ok, exitError on err. */
export async function runAndRender(
  resultAsync: ResultAsync<IssuesResult, ReturnType<typeof mapLinearError>>,
  json: boolean
): Promise<void> {
  await runAndRenderPaged(
    resultAsync.map((r) => ({ rows: r.issues, pageInfo: r.pageInfo })),
    json,
    'issues',
    ISSUE_COLUMNS,
    'issues'
  );
}
