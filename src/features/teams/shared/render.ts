import { ResultAsync } from 'neverthrow';
import { mapLinearError } from '../../../lib/errors.js';
import { printJson } from '../../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import { exitError } from '../../../lib/runner.js';

export interface TeamNode {
  id: string;
  name: string;
  key: string;
}

export interface TeamRow {
  id: string;
  name: string;
  key: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface TeamsResult {
  teams: TeamRow[];
  pageInfo: PageInfo;
}

export interface TeamConnectionData {
  nodes: TeamNode[];
  pageInfo: PageInfo;
}

export type RequestFn = (query: string, vars: Record<string, unknown>) => Promise<unknown>;

export function toTeamRows(nodes: TeamNode[]): TeamRow[] {
  return nodes.map((n) => ({ id: n.id, name: n.name, key: n.key }));
}

export function fetchPage(
  requestFn: RequestFn,
  query: string,
  variables: Record<string, unknown>
): ResultAsync<TeamsResult, ReturnType<typeof mapLinearError>> {
  return ResultAsync.fromPromise(
    requestFn(query, variables).then((data) => {
      const conn = (data as { teams: TeamConnectionData }).teams;
      return { teams: toTeamRows(conn.nodes), pageInfo: conn.pageInfo };
    }),
    (e) => mapLinearError(e)
  );
}

export interface PaginationOptions {
  all: boolean;
  after?: string;
  limit: number;
}

export function fetchTeams(
  requestFn: RequestFn,
  query: string,
  opts: PaginationOptions
): ResultAsync<TeamsResult, ReturnType<typeof mapLinearError>> {
  const variables: Record<string, unknown> = {
    first: opts.limit,
    after: opts.after ?? undefined,
  };

  if (!opts.all) {
    return fetchPage(requestFn, query, variables);
  }

  return ResultAsync.fromPromise(
    (async () => {
      const allTeams: TeamRow[] = [];
      let cursor: string | undefined = opts.after;
      let hasMore = true;
      let lastPageInfo: PageInfo = { hasNextPage: false, endCursor: null };

      while (hasMore) {
        const pageResult = await fetchPage(requestFn, query, { ...variables, after: cursor });
        if (pageResult.isErr()) throw pageResult.error;
        const page = pageResult.value;
        allTeams.push(...page.teams);
        lastPageInfo = page.pageInfo;
        hasMore = page.pageInfo.hasNextPage;
        cursor = page.pageInfo.endCursor ?? undefined;
      }
      return { teams: allTeams, pageInfo: lastPageInfo };
    })(),
    (e) => mapLinearError(e instanceof Error ? e : new Error(String(e)))
  );
}

export function renderTeams(result: TeamsResult, json: boolean): void {
  const { teams, pageInfo } = result;
  if (json) {
    printJson({ teams, pageInfo });
  } else if (process.stdout.isTTY) {
    const rows = teams.map((t) => [t.name, t.key]);
    printTable(prettyTable(['Name', 'Key'], rows));
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      console.log(`\nNext page: --after ${pageInfo.endCursor}`);
    }
  } else {
    const rows = teams.map((t) => [t.id, t.name, t.key]);
    printMarkdown(markdownTable(['ID', 'Name', 'Key'], rows));
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      console.log(`\nNext page: --after ${pageInfo.endCursor}`);
    }
  }
}

export async function runAndRender(
  resultAsync: ResultAsync<TeamsResult, ReturnType<typeof mapLinearError>>,
  json: boolean
): Promise<void> {
  const result = await resultAsync;
  result.match(
    (data) => renderTeams(data, json),
    (e) => exitError(e)
  );
}
