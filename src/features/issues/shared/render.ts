import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { ResultAsync } from 'neverthrow';
import type { mapLinearError } from '../../../lib/errors.js';
import type { PlainField } from '../../../lib/output/plain.js';
import {
  type ColumnConfig,
  fetchOnePage,
  fetchPaged,
  type PagedResult,
  type PageInfo,
  type PaginationOptions,
  type RequestFn,
  renderPaged,
  runAndRenderPaged,
} from '../../../lib/pagination.js';

export type { PageInfo, PaginationOptions, RequestFn };

export interface IssueNode {
  identifier: string;
  title: string;
  state: { name: string } | null;
  assignee: { displayName: string } | null;
  priority: number;
}

export interface IssueRow {
  identifier: string;
  title: string;
  state: string;
  assignee: string;
  priority: number;
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
    priority: n.priority,
  }));
}

/** Map a PagedResult<IssueRow> back to the legacy IssuesResult shape. */
function toIssuesResult(r: PagedResult<IssueRow>): IssuesResult {
  return { issues: r.rows, pageInfo: r.pageInfo };
}

function issuePlainFields(row: IssueRow): PlainField[] {
  return [
    { key: 'title', value: row.title },
    { key: 'state', value: row.state },
    { key: 'priority', value: String(row.priority) },
    { key: 'assignee', value: row.assignee },
  ];
}

const ISSUE_COLUMNS: ColumnConfig<IssueRow> = {
  headers: ['ID', 'Title', 'State', 'Assignee'],
  toRow: (i) => [i.identifier, i.title, i.state, i.assignee],
  plainType: 'Issue',
  plainPrimaryId: (i) => i.identifier,
  toPlainFields: issuePlainFields,
};

/**
 * Fetch one page via client.client.request(), extract the connection from
 * `data[rootKey]`, and return a flat IssuesResult.
 */
export function fetchPage<TData>(
  requestFn: RequestFn,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: TypedDocumentNode<TData, any>,
  variables: Record<string, unknown>,
  rootKey: string
): ResultAsync<IssuesResult, ReturnType<typeof mapLinearError>> {
  return fetchOnePage<TData, IssueNode, IssueRow>(
    requestFn,
    doc,
    variables,
    rootKey,
    toIssueRows
  ).map(toIssuesResult);
}

/**
 * Run one or all pages of a paginated issues query.
 * Uses client.client.request() — one GraphQL call per page, no per-issue calls.
 */
export function fetchIssues<TData>(
  requestFn: RequestFn,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: TypedDocumentNode<TData, any>,
  baseVariables: Record<string, unknown>,
  rootKey: string,
  opts: PaginationOptions
): ResultAsync<IssuesResult, ReturnType<typeof mapLinearError>> {
  return fetchPaged<TData, IssueNode, IssueRow>(
    requestFn,
    doc,
    baseVariables,
    rootKey,
    toIssueRows,
    opts
  ).map(toIssuesResult);
}

/** Render and output an IssuesResult to stdout. */
export function renderIssues(result: IssuesResult, plain: boolean): void {
  renderPaged(
    { rows: result.issues, pageInfo: result.pageInfo },
    plain,
    ISSUE_COLUMNS,
    'issues'
  );
}

/** Unwrap a ResultAsync<IssuesResult>, render on ok, exitError on err. */
export async function runAndRender(
  resultAsync: ResultAsync<IssuesResult, ReturnType<typeof mapLinearError>>,
  plain: boolean
): Promise<void> {
  await runAndRenderPaged(
    resultAsync.map((r) => ({ rows: r.issues, pageInfo: r.pageInfo })),
    plain,
    ISSUE_COLUMNS,
    'issues'
  );
}
