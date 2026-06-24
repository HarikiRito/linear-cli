import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { getClient } from '../../lib/client/index.js';
import { coerceCliError } from '../../lib/errors.js';
import { exitError } from '../../lib/runner.js';
import { resolveProject } from '../issues/shared/resolve.js';
import { type MilestoneResult, renderMilestoneResult } from './shared.js';

export interface CreateMilestoneOptions {
  apiKey?: string;
  token?: string;
  project: string;
  name: string;
  targetDate?: string;
  description?: string;
  json: boolean;
}

async function doCreate(
  client: LinearClient,
  projectId: string,
  opts: CreateMilestoneOptions
): Promise<MilestoneResult> {
  const input: Record<string, unknown> = { name: opts.name, projectId };
  if (opts.targetDate !== undefined) input.targetDate = opts.targetDate;
  if (opts.description !== undefined) input.description = opts.description;

  const payload = await client.createProjectMilestone(
    input as Parameters<typeof client.createProjectMilestone>[0]
  );
  const milestone = await payload.projectMilestone;
  if (!milestone) throw new Error('createProjectMilestone returned no milestone');

  const project = await milestone.project;

  return {
    id: milestone.id,
    name: milestone.name,
    targetDate: milestone.targetDate ?? null,
    description: milestone.description ?? null,
    project: project ? { id: project.id, name: project.name } : null,
  };
}

export async function createMilestone(opts: CreateMilestoneOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const resolvedResult = await resolveProject(opts.project, client);
  if (resolvedResult.isErr()) {
    exitError(resolvedResult.error);
    return;
  }
  const projectId = resolvedResult.value;

  const result = await ResultAsync.fromPromise(doCreate(client, projectId, opts), coerceCliError);

  result.match(
    (milestone) => renderMilestoneResult(milestone, opts.json),
    (e) => exitError(e)
  );
}
