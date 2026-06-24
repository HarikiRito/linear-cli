import type { LinearClient, Project } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { getClient } from '../../../lib/client/index.js';
import { mapLinearError } from '../../../lib/errors.js';
import { normalizePageInfo } from '../../../lib/pagination.js';
import { exitError } from '../../../lib/runner.js';
import { type ProjectsResult, runAndRender, toProjectRows } from '../shared/render.js';

export interface ListProjectsOptions {
  apiKey?: string;
  token?: string;
  limit: number;
  after?: string;
  all: boolean;
  json: boolean;
}

// Project.state is a scalar string in the @linear/sdk v22 Project class.
// SDK routing is safe — no relational subfields needed for this display.
async function fetchProjectsSDK(
  client: LinearClient,
  opts: { limit: number; after?: string; all: boolean }
): Promise<ProjectsResult> {
  if (!opts.all) {
    // Single page
    const conn = await client.projects({ first: opts.limit, after: opts.after });
    return {
      projects: toProjectRows(conn.nodes),
      pageInfo: normalizePageInfo(conn.pageInfo),
    };
  }

  let allNodes: Project[] = [];
  let cursor: string | undefined = opts.after;
  let lastPageInfo = { hasNextPage: false, endCursor: null as string | null };

  do {
    const conn = await client.projects({ first: opts.limit, after: cursor });
    allNodes = allNodes.concat(conn.nodes);
    lastPageInfo = normalizePageInfo(conn.pageInfo);
    cursor =
      conn.pageInfo.hasNextPage && conn.pageInfo.endCursor ? conn.pageInfo.endCursor : undefined;
  } while (cursor !== undefined);

  return {
    projects: toProjectRows(allNodes),
    pageInfo: lastPageInfo,
  };
}

export async function listProjects(opts: ListProjectsOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const resultAsync = ResultAsync.fromPromise(
    fetchProjectsSDK(client, { limit: opts.limit, after: opts.after, all: opts.all }),
    (e) => mapLinearError(e)
  );

  await runAndRender(resultAsync, opts.json);
}
