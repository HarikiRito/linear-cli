import { ResultAsync } from 'neverthrow';
import { getClient, getRequestFn } from '../../../lib/client/index.js';
import { ValidationError, mapLinearError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import {
  looksLikeId,
  resolveAssignee,
  resolveCycle,
  resolveLabels,
  resolveMilestone,
  resolveProject,
  resolveTeam,
  resolveWorkflowState,
} from '../shared/resolve.js';
import { type IssueNode, type IssueResult, extractIssueUpdate, renderIssue } from '../shared/renderIssue.js';
import { ISSUE_UPDATE_MUTATION } from './mutations.js';

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
  const requestFn = getRequestFn(client);

  const input: Record<string, unknown> = {};

  if (opts.title !== undefined) input.title = opts.title;
  if (description !== undefined) input.description = description;
  if (opts.priority !== undefined) input.priority = opts.priority;
  if (opts.estimate !== undefined) input.estimate = opts.estimate;
  if (opts.parent !== undefined) input.parentId = opts.parent;
  if (opts.dueDate !== undefined) input.dueDate = opts.dueDate;

  // team needed to resolve state/cycle
  let resolvedTeamId: string | undefined;
  if (opts.team !== undefined) {
    const r = await resolveTeam(opts.team, requestFn);
    if (r.isErr()) {
      exitError(r.error);
      return;
    }
    resolvedTeamId = r.value;
    input.teamId = resolvedTeamId;
  }

  // Resolve project — milestone depends on projectId
  let resolvedProjectId: string | undefined;
  if (opts.project !== undefined) {
    const r = await resolveProject(opts.project, requestFn);
    if (r.isErr()) {
      exitError(r.error);
      return;
    }
    resolvedProjectId = r.value;
    input.projectId = resolvedProjectId;
  }

  // Validate before parallel batch
  if (opts.milestone !== undefined && !resolvedProjectId) {
    exitError(new ValidationError('--milestone requires --project to be specified'));
    return;
  }
  if (opts.state !== undefined && !looksLikeId(opts.state) && !resolvedTeamId) {
    exitError(new ValidationError('--state by name requires --team to be specified for resolution'));
    return;
  }
  if (opts.cycle !== undefined && !looksLikeId(opts.cycle) && !resolvedTeamId) {
    exitError(new ValidationError('--cycle by name requires --team to be specified for resolution'));
    return;
  }

  // Resolve independent entities concurrently
  const [milestoneResult, assigneeResult, labelsResult, stateResult, cycleResult] =
    await Promise.all([
      opts.milestone !== undefined
        ? resolveMilestone(opts.milestone, resolvedProjectId as string, requestFn)
        : Promise.resolve(null),
      opts.assignee !== undefined
        ? resolveAssignee(opts.assignee, requestFn)
        : Promise.resolve(null),
      opts.labels !== undefined && opts.labels.length > 0
        ? resolveLabels(opts.labels, requestFn)
        : Promise.resolve(null),
      opts.state !== undefined
        ? resolveWorkflowState(opts.state, resolvedTeamId ?? '', requestFn)
        : Promise.resolve(null),
      opts.cycle !== undefined
        ? resolveCycle(opts.cycle, resolvedTeamId ?? '', requestFn)
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
    requestFn(ISSUE_UPDATE_MUTATION, { id: opts.id, input }).then((data) =>
      extractIssueUpdate(data as { issueUpdate: { issue: IssueNode } })
    ),
    (e) => mapLinearError(e)
  );

  result.match(
    (issue: IssueResult) => renderIssue(issue, opts.json),
    (e) => exitError(e)
  );
}
