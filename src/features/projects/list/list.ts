import { getClient } from '../../../lib/client/index.js';
import { exitError } from '../../../lib/runner.js';
import { fetchProjects, runAndRender } from '../shared/render.js';
import { LIST_PROJECTS_QUERY } from './queries.js';

export interface ListProjectsOptions {
  apiKey?: string;
  token?: string;
  limit: number;
  after?: string;
  all: boolean;
  json: boolean;
}

export async function listProjects(opts: ListProjectsOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = (client.client as { request: (q: string, v: Record<string, unknown>) => Promise<unknown> }).request.bind(client.client);

  await runAndRender(
    fetchProjects(requestFn, LIST_PROJECTS_QUERY, {
      all: opts.all,
      after: opts.after,
      limit: opts.limit,
    }),
    opts.json
  );
}
