import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { getClient } from '../../lib/client/index.js';
import { coerceCliError } from '../../lib/errors.js';
import { exitError } from '../../lib/runner.js';
import { type MilestoneResult, renderMilestoneResult } from './shared.js';

export interface UpdateMilestoneOptions {
  apiKey?: string;
  token?: string;
  id: string;
  name?: string;
  targetDate?: string;
  description?: string;
  plain: boolean;
}

async function doUpdate(
  client: LinearClient,
  opts: UpdateMilestoneOptions
): Promise<MilestoneResult> {
  const input: Record<string, unknown> = {};
  if (opts.name !== undefined) input.name = opts.name;
  if (opts.targetDate !== undefined) input.targetDate = opts.targetDate;
  if (opts.description !== undefined) input.description = opts.description;

  const payload = await client.updateProjectMilestone(opts.id, input);
  const milestone = await payload.projectMilestone;
  if (!milestone) throw new Error('updateProjectMilestone returned no milestone');

  const project = await milestone.project;

  return {
    id: milestone.id,
    name: milestone.name,
    targetDate: milestone.targetDate ?? null,
    description: milestone.description ?? null,
    project: project ? { id: project.id, name: project.name } : null,
  };
}

export async function updateMilestone(opts: UpdateMilestoneOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const result = await ResultAsync.fromPromise(doUpdate(client, opts), coerceCliError);

  result.match(
    (milestone) => renderMilestoneResult(milestone, opts.plain),
    (e) => exitError(e)
  );
}
