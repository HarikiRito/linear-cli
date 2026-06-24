import { ResultAsync } from 'neverthrow';
import { getClient, getRequestFn } from '../../../lib/client/index.js';
import { ValidationError, mapLinearError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import {
  resolveAssignee,
  resolveCycle,
  resolveLabels,
  resolveMilestone,
  resolveProject,
  resolveTeam,
  resolveWorkflowState,
} from '../shared/resolve.js';
import { type IssueNode, type IssueResult, extractIssueCreate, renderIssue } from '../shared/renderIssue.js';
import { ISSUE_CREATE_MUTATION } from './mutations.js';

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
  json: boolean;
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
  const requestFn = getRequestFn(client);

  const teamResult = await resolveTeam(opts.team, requestFn);
  if (teamResult.isErr()) {
    exitError(teamResult.error);
    return;
  }
  const teamId = teamResult.value;

  const input: Record<string, unknown> = { title: opts.title, teamId };

  if (description !== undefined) input.description = description;
  if (opts.priority !== undefined) input.priority = opts.priority;
  if (opts.estimate !== undefined) input.estimate = opts.estimate;
  if (opts.parent !== undefined) input.parentId = opts.parent;
  if (opts.dueDate !== undefined) input.dueDate = opts.dueDate;

  // Resolve project first — milestone depends on projectId
  if (opts.project !== undefined) {
    const r = await resolveProject(opts.project, requestFn);
    if (r.isErr()) {
      exitError(r.error);
      return;
    }
    input.projectId = r.value;
  }

  // Milestone validation must precede the parallel batch
  if (opts.milestone !== undefined && !input.projectId) {
    exitError(new ValidationError('--milestone requires --project to be specified'));
    return;
  }

  // Resolve independent entities concurrently
  const [milestoneResult, assigneeResult, labelsResult, stateResult, cycleResult] =
    await Promise.all([
      opts.milestone !== undefined
        ? resolveMilestone(opts.milestone, input.projectId as string, requestFn)
        : Promise.resolve(null),
      opts.assignee !== undefined
        ? resolveAssignee(opts.assignee, requestFn)
        : Promise.resolve(null),
      opts.labels !== undefined && opts.labels.length > 0
        ? resolveLabels(opts.labels, requestFn)
        : Promise.resolve(null),
      opts.state !== undefined
        ? resolveWorkflowState(opts.state, teamId, requestFn)
        : Promise.resolve(null),
      opts.cycle !== undefined
        ? resolveCycle(opts.cycle, teamId, requestFn)
        : Promise.resolve(null),
    ]);

  // Check results in original order: milestone, assignee, labels, state, cycle
  if (milestoneResult !== null) {
    if (milestoneResult.isErr()) { exitError(milestoneResult.error); return; }
    input.projectMilestoneId = milestoneResult.value;
  }
  if (assigneeResult !== null) {
    if (assigneeResult.isErr()) { exitError(assigneeResult.error); return; }
    input.assigneeId = assigneeResult.value;
  }
  if (labelsResult !== null) {
    if (labelsResult.isErr()) { exitError(labelsResult.error); return; }
    input.labelIds = labelsResult.value;
  }
  if (stateResult !== null) {
    if (stateResult.isErr()) { exitError(stateResult.error); return; }
    input.stateId = stateResult.value;
  }
  if (cycleResult !== null) {
    if (cycleResult.isErr()) { exitError(cycleResult.error); return; }
    input.cycleId = cycleResult.value;
  }

  const result = await ResultAsync.fromPromise(
    requestFn(ISSUE_CREATE_MUTATION, { input }).then((data) =>
      extractIssueCreate(data as { issueCreate: { issue: IssueNode } })
    ),
    (e) => mapLinearError(e)
  );

  result.match(
    (issue: IssueResult) => renderIssue(issue, opts.json),
    (e) => exitError(e)
  );
}
