import { ResultAsync, okAsync } from 'neverthrow';
import { mapLinearError } from './errors.js';
import { printJson } from './output/json.js';
import { markdownTable, printMarkdown } from './output/markdown.js';
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

/** Callable wrapping client.client.request() */
export type RequestFn = (query: string, vars: Record<string, unknown>) => Promise<unknown>;

export interface PaginationOptions {
  all: boolean;
  after?: string;
  limit: number;
}

// ---------------------------------------------------------------------------
// Column config used for TTY table and Markdown output
// ---------------------------------------------------------------------------
export interface ColumnConfig<TRow> {
  /** Column headers for Markdown output (and TTY when ttyHeaders is absent) */
  headers: string[];
  /** Map a row to cell strings for Markdown (and TTY when ttyToRow is absent) */
  toRow: (row: TRow) => string[];
  /**
   * Optional TTY-only column headers. When present, the TTY branch uses these
   * instead of `headers` — allows asymmetric column sets (e.g. omit ID in TTY).
   */
  ttyHeaders?: string[];
  /** Optional TTY-only row mapper, paired with ttyHeaders. */
  ttyToRow?: (row: TRow) => string[];
}

// ---------------------------------------------------------------------------
// Generic fetch helpers
// ---------------------------------------------------------------------------

/**
 * Fetch one page via client.client.request(), extract the connection from
 * `data[rootKey]`, convert nodes with `toRow`, and return a PagedResult.
 */
export function fetchOnePage<TNode, TRow>(
  requestFn: RequestFn,
  query: string,
  variables: Record<string, unknown>,
  rootKey: string,
  toRow: (nodes: TNode[]) => TRow[]
): ResultAsync<PagedResult<TRow>, ReturnType<typeof mapLinearError>> {
  return ResultAsync.fromPromise(
    requestFn(query, variables).then((data) => {
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
export function fetchPaged<TNode, TRow>(
  requestFn: RequestFn,
  query: string,
  baseVariables: Record<string, unknown>,
  rootKey: string,
  toRow: (nodes: TNode[]) => TRow[],
  opts: PaginationOptions
): ResultAsync<PagedResult<TRow>, ReturnType<typeof mapLinearError>> {
  const variables = { ...baseVariables, first: opts.limit, after: opts.after ?? undefined };

  if (!opts.all) {
    return fetchOnePage(requestFn, query, variables, rootKey, toRow);
  }

  // Accumulate pages by chaining ResultAsync without throwing, so typed errors
  // (e.g. RateLimitError) propagate unchanged rather than being re-wrapped by
  // a fromPromise catch handler that cannot recognise non-Error instances.
  const step = (
    cursor: string | undefined,
    accumulated: TRow[]
  ): ResultAsync<PagedResult<TRow>, ReturnType<typeof mapLinearError>> =>
    fetchOnePage(requestFn, query, { ...variables, after: cursor }, rootKey, toRow).andThen(
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
 * - json=true → printJson with `{ [jsonKey]: rows, pageInfo }`
 * - isTTY → prettyTable
 * - else → markdownTable + optional stderr count line
 */
export function renderPaged<TRow>(
  result: PagedResult<TRow>,
  json: boolean,
  jsonKey: string,
  columns: ColumnConfig<TRow>,
  countLabel?: string
): void {
  const { rows, pageInfo } = result;
  if (json) {
    printJson({ [jsonKey]: rows, pageInfo });
  } else if (process.stdout.isTTY) {
    const headers = columns.ttyHeaders ?? columns.headers;
    const rowMapper = columns.ttyToRow ?? columns.toRow;
    printTable(prettyTable(headers, rows.map(rowMapper)));
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      console.log(`\nNext page: --after ${pageInfo.endCursor}`);
    }
  } else {
    printMarkdown(markdownTable(columns.headers, rows.map(columns.toRow)));
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      console.log(`\nNext page: --after ${pageInfo.endCursor}`);
    }
    if (countLabel) {
      console.error(`Showing ${rows.length} ${countLabel}`);
    }
  }
}

/** Unwrap a ResultAsync<PagedResult<TRow>>, render on ok, exitError on err. */
export async function runAndRenderPaged<TRow>(
  resultAsync: ResultAsync<PagedResult<TRow>, ReturnType<typeof mapLinearError>>,
  json: boolean,
  jsonKey: string,
  columns: ColumnConfig<TRow>,
  countLabel?: string
): Promise<void> {
  const result = await resultAsync;
  result.match(
    (data) => renderPaged(data, json, jsonKey, columns, countLabel),
    (e) => exitError(e)
  );
}
