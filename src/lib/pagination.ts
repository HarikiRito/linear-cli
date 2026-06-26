import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { okAsync, ResultAsync } from 'neverthrow';
import { mapLinearError } from './errors.js';
import type { PlainField } from './output/plain.js';
import { renderPlainList } from './output/plain.js';
import { prettyTable, printTable } from './output/table.js';
import { exitError } from './runner.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

/** A connection result returned by a GraphQL query — one page. */
export interface ConnectionData<TNode> {
  nodes: TNode[];
  pageInfo: PageInfo;
}

/** The row-level record kept in memory across pages. */
export interface PagedResult<TRow> {
  rows: TRow[];
  pageInfo: PageInfo;
}

/**
 * Typed callable wrapping client.client.request().
 * Accepts a TypedDocumentNode so TData flows through from the codegen-generated types.
 */
export type RequestFn = <TData, TVariables extends Record<string, unknown>>(
  doc: TypedDocumentNode<TData, TVariables>,
  vars: TVariables
) => Promise<TData>;

/** Normalize a raw SDK pageInfo shape to our PageInfo type (coerces undefined endCursor to null). */
export function normalizePageInfo(raw: {
  hasNextPage: boolean;
  endCursor?: string | null;
}): PageInfo {
  return { hasNextPage: raw.hasNextPage, endCursor: raw.endCursor ?? null };
}

export interface PaginationOptions {
  all: boolean;
  after?: string;
  limit: number;
}

// ---------------------------------------------------------------------------
// Column config used for table output and optional plain output
// ---------------------------------------------------------------------------
export interface ColumnConfig<TRow> {
  /** Column headers for the boxed table */
  headers: string[];
  /** Map a row to cell strings for the table */
  toRow: (row: TRow) => string[];
  /** For --plain list output: the type label (e.g. 'Issue', 'Project'). */
  plainType?: string;
  /** For --plain list output: extract the primary identifier from a row. */
  plainPrimaryId?: (row: TRow) => string;
  /** For --plain list output: extract key/value fields from a row. */
  toPlainFields?: (row: TRow) => PlainField[];
}

// ---------------------------------------------------------------------------
// Generic fetch helpers
// ---------------------------------------------------------------------------

/**
 * Fetch one page via client.client.request(), extract the connection from
 * `data[rootKey]`, convert nodes with `toRow`, and return a PagedResult.
 */
export function fetchOnePage<TData, TNode, TRow>(
  requestFn: RequestFn,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: TypedDocumentNode<TData, any>,
  variables: Record<string, unknown>,
  rootKey: string,
  toRow: (nodes: TNode[]) => TRow[]
): ResultAsync<PagedResult<TRow>, ReturnType<typeof mapLinearError>> {
  return ResultAsync.fromPromise(
    requestFn(doc, variables).then((data) => {
      const conn = (data as Record<string, ConnectionData<TNode>>)[rootKey];
      return { rows: toRow(conn.nodes), pageInfo: conn.pageInfo };
    }),
    (e) => mapLinearError(e)
  );
}

/**
 * Run one or all pages of a paginated GraphQL query.
 * Single GraphQL request per page — no N+1.
 */
export function fetchPaged<TData, TNode, TRow>(
  requestFn: RequestFn,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: TypedDocumentNode<TData, any>,
  baseVariables: Record<string, unknown>,
  rootKey: string,
  toRow: (nodes: TNode[]) => TRow[],
  opts: PaginationOptions
): ResultAsync<PagedResult<TRow>, ReturnType<typeof mapLinearError>> {
  const variables = { ...baseVariables, first: opts.limit, after: opts.after ?? undefined };

  if (!opts.all) {
    return fetchOnePage(requestFn, doc, variables, rootKey, toRow);
  }

  // Accumulate pages by chaining ResultAsync without throwing, so typed errors
  // (e.g. RateLimitError) propagate unchanged rather than being re-wrapped by
  // a fromPromise catch handler that cannot recognise non-Error instances.
  const step = (
    cursor: string | undefined,
    accumulated: TRow[]
  ): ResultAsync<PagedResult<TRow>, ReturnType<typeof mapLinearError>> =>
    fetchOnePage(requestFn, doc, { ...variables, after: cursor }, rootKey, toRow).andThen(
      (page) => {
        const rows = [...accumulated, ...page.rows];
        if (page.pageInfo.hasNextPage && page.pageInfo.endCursor) {
          return step(page.pageInfo.endCursor, rows);
        }
        return okAsync({ rows, pageInfo: page.pageInfo });
      }
    );

  return step(opts.after, []);
}

// ---------------------------------------------------------------------------
// Generic render + run helpers
// ---------------------------------------------------------------------------

/**
 * Render a PagedResult to stdout.
 * - plain=true → renderPlainList (if columns has plainType/plainPrimaryId/toPlainFields)
 * - default → always boxed cli-table3 prettyTable (regardless of isTTY)
 */
export function renderPaged<TRow>(
  result: PagedResult<TRow>,
  plain: boolean,
  columns: ColumnConfig<TRow>,
  countLabel?: string
): void {
  const { rows, pageInfo } = result;

  if (plain && columns.plainType && columns.plainPrimaryId && columns.toPlainFields) {
    const records = rows.map((r) => ({
      primaryId: columns.plainPrimaryId!(r),
      fields: columns.toPlainFields!(r),
    }));
    console.log(renderPlainList(columns.plainType, records));
    return;
  }

  // Default: always boxed table regardless of TTY
  printTable(prettyTable(columns.headers, rows.map(columns.toRow)));
  if (pageInfo.hasNextPage && pageInfo.endCursor) {
    console.log(`\nNext page: --after ${pageInfo.endCursor}`);
  }
  void countLabel; // retained for API compat; no longer emitted to stderr
}

/** Unwrap a ResultAsync<PagedResult<TRow>>, render on ok, exitError on err. */
export async function runAndRenderPaged<TRow>(
  resultAsync: ResultAsync<PagedResult<TRow>, ReturnType<typeof mapLinearError>>,
  plain: boolean,
  columns: ColumnConfig<TRow>,
  countLabel?: string
): Promise<void> {
  const result = await resultAsync;
  result.match(
    (data) => renderPaged(data, plain, columns, countLabel),
    (e) => exitError(e)
  );
}
