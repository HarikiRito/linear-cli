import type { LinearClient, Team } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { getClient } from '../../../lib/client/index.js';
import { mapLinearError } from '../../../lib/errors.js';
import { normalizePageInfo } from '../../../lib/pagination.js';
import { exitError } from '../../../lib/runner.js';
import { runAndRender, type TeamsResult, toTeamRows } from '../shared/render.js';

export interface ListTeamsOptions {
  apiKey?: string;
  token?: string;
  limit: number;
  after?: string;
  all: boolean;
  json: boolean;
}

async function fetchTeamsSDK(
  client: LinearClient,
  opts: { limit: number; after?: string; all: boolean }
): Promise<TeamsResult> {
  if (!opts.all) {
    // Single page
    const conn = await client.teams({ first: opts.limit, after: opts.after });
    return {
      teams: toTeamRows(conn.nodes),
      pageInfo: normalizePageInfo(conn.pageInfo),
    };
  }

  let allNodes: Team[] = [];
  let cursor: string | undefined = opts.after;
  let lastPageInfo = { hasNextPage: false, endCursor: null as string | null };

  do {
    const conn = await client.teams({ first: opts.limit, after: cursor });
    allNodes = allNodes.concat(conn.nodes);
    lastPageInfo = normalizePageInfo(conn.pageInfo);
    cursor =
      conn.pageInfo.hasNextPage && conn.pageInfo.endCursor ? conn.pageInfo.endCursor : undefined;
  } while (cursor !== undefined);

  return {
    teams: toTeamRows(allNodes),
    pageInfo: lastPageInfo,
  };
}

export async function listTeams(opts: ListTeamsOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const resultAsync = ResultAsync.fromPromise(
    fetchTeamsSDK(client, { limit: opts.limit, after: opts.after, all: opts.all }),
    (e) => mapLinearError(e)
  );

  await runAndRender(resultAsync, opts.json);
}
