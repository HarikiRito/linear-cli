import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { getClient } from '../../../lib/client/index.js';
import { coerceCliError, ValidationError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import { type IssueResult, renderIssue } from '../shared/renderIssue.js';
import {
  resolveAssignee,
  resolveCycle,
  resolveLabels,
  resolveMilestone,
  resolveProject,
  resolveTeam,
  resolveWorkflowState,
} from '../shared/resolve.js';

export interface CreateIssueOptions {
  apiKey?: string;
  token?: string;
  title: string;
  team: string;
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
  plain: boolean;
}

async function resolveAndCreate(
  client: LinearClient,
  opts: CreateIssueOptions,
  description: string | undefined
): Promise<IssueResult> {
  const teamResult = await resolveTeam(opts.team, client);
  if (teamResult.isErr()) throw teamResult.error;
  const teamId = teamResult.value;

  const input: Record<string, unknown> = { title: opts.title, teamId };

  if (description !== undefined) input.description = description;
  if (opts.priority !== undefined) input.priority = opts.priority;
  if (opts.estimate !== undefined) input.estimate = opts.estimate;
  if (opts.parent !== undefined) input.parentId = opts.parent;
  if (opts.dueDate !== undefined) input.dueDate = opts.dueDate;

  // Resolve project first — milestone depends on projectId
  if (opts.project !== undefined) {
    const r = await resolveProject(opts.project, client);
    if (r.isErr()) throw r.error;
    input.projectId = r.value;
  }

  // Milestone validation must precede the parallel batch
  if (opts.milestone !== undefined && !input.projectId) {
    throw new ValidationError('--milestone requires --project to be specified');
  }

  const [milestoneResult, assigneeResult, labelsResult, stateResult, cycleResult] =
    await Promise.all([
      opts.milestone !== undefined
        ? resolveMilestone(opts.milestone, input.projectId as string, client)
        : Promise.resolve(null),
      opts.assignee !== undefined ? resolveAssignee(opts.assignee, client) : Promise.resolve(null),
      opts.labels !== undefined && opts.labels.length > 0
        ? resolveLabels(opts.labels, client)
        : Promise.resolve(null),
      opts.state !== undefined
        ? resolveWorkflowState(opts.state, teamId, client)
        : Promise.resolve(null),
      opts.cycle !== undefined ? resolveCycle(opts.cycle, teamId, client) : Promise.resolve(null),
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

  const payload = await client.createIssue(input as Parameters<typeof client.createIssue>[0]);
  const issue = await payload.issue;
  if (!issue) throw new Error('createIssue returned no issue');

  const stateObj = await issue.state;

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    state: stateObj?.name ?? '',
  };
}

export async function createIssue(opts: CreateIssueOptions): Promise<void> {
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
    resolveAndCreate(client, opts, description),
    coerceCliError
  );

  result.match(
    (issue: IssueResult) => renderIssue(issue, opts.plain),
    (e) => exitError(e)
  );
}
