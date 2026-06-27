import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { coerceCliError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveAssignee, resolveProject } from '../../issues/shared/resolve.js';
import { type ProjectResult, renderProjectResult } from '../shared/render.js';

export interface UpdateProjectOptions {
  apiKey?: string;
  token?: string;
  id: string;
  name?: string;
  description?: string;
  lead?: string;
  targetDate?: string;
  startDate?: string;
  state?: string;
  plain: boolean;
}

async function resolveAndUpdate(
  client: LinearClient,
  opts: UpdateProjectOptions
): Promise<ProjectResult> {
  const resolvedResult = await resolveProject(opts.id, client);
  if (resolvedResult.isErr()) throw resolvedResult.error;
  const projectId = resolvedResult.value;

  const input: Record<string, unknown> = {};
  if (opts.name !== undefined) input.name = opts.name;
  if (opts.description !== undefined) input.description = opts.description;
  if (opts.targetDate !== undefined) input.targetDate = opts.targetDate;
  if (opts.startDate !== undefined) input.startDate = opts.startDate;
  if (opts.state !== undefined) input.statusId = opts.state;

  if (opts.lead !== undefined) {
    const leadResult = await resolveAssignee(opts.lead, client);
    if (leadResult.isErr()) throw leadResult.error;
    input.leadId = leadResult.value;
  }

  const payload = await client.updateProject(projectId, input);
  const project = await payload.project;
  if (!project) throw new Error('updateProject returned no project');

  return { id: project.id, name: project.name, state: project.state, url: project.url };
}

export async function updateProject(opts: UpdateProjectOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const result = await ResultAsync.fromPromise(resolveAndUpdate(client, opts), coerceCliError);

  result.match(
    (p) => renderProjectResult(p, opts.plain),
    (e) => exitError(e)
  );
}
