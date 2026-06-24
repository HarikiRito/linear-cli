import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { getClient } from '../../../lib/client/index.js';
import { coerceCliError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveAssignee, resolveTeam } from '../../issues/shared/resolve.js';
import { type ProjectResult, renderProjectResult } from '../shared/render.js';

export interface CreateProjectOptions {
  apiKey?: string;
  token?: string;
  name: string;
  team: string;
  description?: string;
  lead?: string;
  targetDate?: string;
  startDate?: string;
  state?: string;
  json: boolean;
  pretty: boolean;
}

async function resolveAndCreate(
  client: LinearClient,
  opts: CreateProjectOptions
): Promise<ProjectResult> {
  const teamResult = await resolveTeam(opts.team, client);
  if (teamResult.isErr()) throw teamResult.error;
  const teamId = teamResult.value;

  const input: Record<string, unknown> = { name: opts.name, teamIds: [teamId] };
  if (opts.description !== undefined) input.description = opts.description;
  if (opts.targetDate !== undefined) input.targetDate = opts.targetDate;
  if (opts.startDate !== undefined) input.startDate = opts.startDate;
  if (opts.state !== undefined) input.statusId = opts.state;

  if (opts.lead !== undefined) {
    const leadResult = await resolveAssignee(opts.lead, client);
    if (leadResult.isErr()) throw leadResult.error;
    input.leadId = leadResult.value;
  }

  const payload = await client.createProject(input as Parameters<typeof client.createProject>[0]);
  const project = await payload.project;
  if (!project) throw new Error('createProject returned no project');

  return { id: project.id, name: project.name, state: project.state, url: project.url };
}

export async function createProject(opts: CreateProjectOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const result = await ResultAsync.fromPromise(resolveAndCreate(client, opts), coerceCliError);

  result.match(
    (p) => renderProjectResult(p, opts.json, opts.pretty),
    (e) => exitError(e)
  );
}
