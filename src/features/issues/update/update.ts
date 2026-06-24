import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { getClient } from '../../../lib/client/index.js';
import { coerceCliError, ValidationError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import { type IssueResult, renderIssue } from '../shared/renderIssue.js';
import {
  looksLikeId,
  resolveAssignee,
  resolveCycle,
  resolveIssueIdentifier,
  resolveLabels,
  resolveMilestone,
  resolveProject,
  resolveTeam,
  resolveWorkflowState,
} from '../shared/resolve.js';

export interface UpdateIssueOptions {
  apiKey?: string;
  token?: string;
  id: string;
  title?: string;
  team?: string;
  description?: string;
  project?: string;
  milestone?: string;
  assignee?: string;
  labels?: string[];
  state?: string;
  priority?: number;
  estimate?: number;
  cycle?: string;
  parent?: string;
  dueDate?: string;
  json: boolean;
  pretty: boolean;
}

async function resolveAndUpdate(
  client: LinearClient,
  opts: UpdateIssueOptions,
  description: string | undefined
): Promise<IssueResult> {
  const idResult = await resolveIssueIdentifier(opts.id, client);
  if (idResult.isErr()) throw idResult.error;
  const resolvedId = idResult.value;

  const input: Record<string, unknown> = {};

  if (opts.title !== undefined) input.title = opts.title;
  if (description !== undefined) input.description = description;
  if (opts.priority !== undefined) input.priority = opts.priority;
  if (opts.estimate !== undefined) input.estimate = opts.estimate;
  if (opts.parent !== undefined) input.parentId = opts.parent;
  if (opts.dueDate !== undefined) input.dueDate = opts.dueDate;

  let resolvedTeamId: string | undefined;
  if (opts.team !== undefined) {
    const r = await resolveTeam(opts.team, client);
    if (r.isErr()) throw r.error;
    resolvedTeamId = r.value;
    input.teamId = resolvedTeamId;
  }

  // Resolve project — milestone depends on projectId
  let resolvedProjectId: string | undefined;
  if (opts.project !== undefined) {
    const r = await resolveProject(opts.project, client);
    if (r.isErr()) throw r.error;
    resolvedProjectId = r.value;
    input.projectId = resolvedProjectId;
  }

  if (opts.milestone !== undefined && !resolvedProjectId) {
    throw new ValidationError('--milestone requires --project to be specified');
  }
  if (opts.state !== undefined && !looksLikeId(opts.state) && !resolvedTeamId) {
    throw new ValidationError('--state by name requires --team to be specified for resolution');
  }
  if (opts.cycle !== undefined && !looksLikeId(opts.cycle) && !resolvedTeamId) {
    throw new ValidationError('--cycle by name requires --team to be specified for resolution');
  }

  const [milestoneResult, assigneeResult, labelsResult, stateResult, cycleResult] =
    await Promise.all([
      opts.milestone !== undefined
        ? resolveMilestone(opts.milestone, resolvedProjectId as string, client)
        : Promise.resolve(null),
      opts.assignee !== undefined ? resolveAssignee(opts.assignee, client) : Promise.resolve(null),
      opts.labels !== undefined && opts.labels.length > 0
        ? resolveLabels(opts.labels, client)
        : Promise.resolve(null),
      opts.state !== undefined
        ? resolveWorkflowState(opts.state, resolvedTeamId ?? '', client)
        : Promise.resolve(null),
      opts.cycle !== undefined
        ? resolveCycle(opts.cycle, resolvedTeamId ?? '', client)
        : Promise.resolve(null),
    ]);

  if (milestoneResult !== null) {
    if (milestoneResult.isErr()) throw milestoneResult.error;
    input.projectMilestoneId = milestoneResult.value;
  }
  if (assigneeResult !== null) {
    if (assigneeResult.isErr()) throw assigneeResult.error;
    input.assigneeId = assigneeResult.value;
  }
  if (labelsResult !== null) {
    if (labelsResult.isErr()) throw labelsResult.error;
    input.labelIds = labelsResult.value;
  }
  if (stateResult !== null) {
    if (stateResult.isErr()) throw stateResult.error;
    input.stateId = stateResult.value;
  }
  if (cycleResult !== null) {
    if (cycleResult.isErr()) throw cycleResult.error;
    input.cycleId = cycleResult.value;
  }

  const payload = await client.updateIssue(resolvedId, input);
  const issue = await payload.issue;
  if (!issue) throw new Error('updateIssue returned no issue');

  const stateObj = await issue.state;

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    state: stateObj?.name ?? '',
  };
}

export async function updateIssue(opts: UpdateIssueOptions): Promise<void> {
  if (opts.priority !== undefined && (opts.priority < 0 || opts.priority > 4)) {
    exitError(new ValidationError(`Priority must be between 0 and 4, got ${opts.priority}`));
    return;
  }

  const description = opts.description === '-' ? await readStdin() : opts.description;

  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const result = await ResultAsync.fromPromise(
    resolveAndUpdate(client, opts, description),
    coerceCliError
  );

  result.match(
    (issue: IssueResult) => renderIssue(issue, opts.json, opts.pretty),
    (e) => exitError(e)
  );
}
