import type { LinearClient } from '@linear/sdk';
import { type Result, ResultAsync } from 'neverthrow';
import pc from 'picocolors';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import {
  type CliError,
  coerceCliError,
  ValidationError,
  validatePriority,
} from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import {
  attachIfNonImage,
  type FileAttachResult,
  isImageFile,
  uploadAndClassify,
} from '../../../lib/upload.js';
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
  noParent?: boolean;
  dueDate?: string;
  // Local file to upload. Images are embedded inline in the description (appended
  // to an explicit --description, or to the issue's current description if
  // --description wasn't given); other file types are attached to the resource
  // tab after the update, description left untouched.
  file?: string;
  plain: boolean;
}

async function buildInput(
  client: LinearClient,
  opts: Omit<UpdateIssueOptions, 'id' | 'apiKey' | 'token'>,
  description: string | undefined
): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = {};

  if (opts.title !== undefined) input.title = opts.title;
  if (description !== undefined) input.description = description;
  if (opts.priority !== undefined) input.priority = opts.priority;
  if (opts.estimate !== undefined) input.estimate = opts.estimate;
  if (opts.noParent) {
    input.parentId = null;
  } else if (opts.parent !== undefined) {
    input.parentId = opts.parent;
  }
  if (opts.dueDate !== undefined) input.dueDate = opts.dueDate;

  let resolvedTeamId: string | undefined;
  if (opts.team !== undefined) {
    const r = await resolveTeam(opts.team, client);
    if (r.isErr()) throw r.error;
    resolvedTeamId = r.value;
    input.teamId = resolvedTeamId;
  }

  // Resolve project — milestone depends on projectId. projectId is set ONLY
  // when --project is explicitly passed: a global config.toml default
  // project can belong to a different workspace than the resolved
  // credential/team, and injecting it into an update leaks cross-workspace
  // (the API rejects it with validateAccess — see H-475). Updates never
  // auto-fill the config default; `issues create` keeps that behavior for
  // new issues.
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

  return input;
}

/**
 * Resolve all shared update fields (name→ID lookups, validations, passthrough fields) into
 * a GraphQL-ready input object. Does NOT resolve the issue identifier or perform the mutation.
 * Call this once per batch to avoid redundant API calls for identical shared inputs.
 */
export function resolveUpdateInput(
  client: LinearClient,
  opts: Omit<UpdateIssueOptions, 'id' | 'apiKey' | 'token'>,
  description: string | undefined
): ResultAsync<Record<string, unknown>, CliError> {
  return ResultAsync.fromPromise(buildInput(client, opts, description), coerceCliError);
}

export async function resolveAndUpdate(
  client: LinearClient,
  opts: UpdateIssueOptions,
  description: string | undefined
): Promise<IssueResult> {
  const idResult = await resolveIssueIdentifier(opts.id, client);
  if (idResult.isErr()) throw idResult.error;
  const resolvedId = idResult.value;

  const inputResult = await resolveUpdateInput(client, opts, description);
  if (inputResult.isErr()) throw inputResult.error;
  const input = inputResult.value;

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
  const priorityErr = validatePriority(opts.priority);
  if (priorityErr) {
    exitError(priorityErr);
    return;
  }

  const description = opts.description === '-' ? await readStdin() : opts.description;

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const idResult = await resolveIssueIdentifier(opts.id, client);
  if (idResult.isErr()) {
    exitError(idResult.error);
    return;
  }
  const resolvedId = idResult.value;

  // Upload file if --file provided. Images embed inline in the description
  // (appended to an explicit --description, or fetched-and-appended to the
  // current description otherwise); other file types are attached to the
  // resource tab after the update (below), and the description is left
  // untouched.
  let finalDescription = description;
  let fileOutcome: FileAttachResult | undefined;
  let pendingUpload: Promise<Result<FileAttachResult, Error>> | undefined;
  if (opts.file) {
    if (isImageFile(opts.file)) {
      // Sequential: the embed markdown must land in the description before updateIssue runs.
      const outcomeResult = await uploadAndClassify(client, opts.file);
      if (outcomeResult.isErr()) {
        exitError(outcomeResult.error);
        return;
      }
      fileOutcome = outcomeResult.value;
      const md = fileOutcome.embedMarkdown;
      if (description !== undefined) {
        finalDescription = description ? `${description}\n\n${md}` : md;
      } else {
        const currentIssueResult = await ResultAsync.fromPromise(
          client.issue(resolvedId),
          coerceCliError
        );
        if (currentIssueResult.isErr()) {
          exitError(currentIssueResult.error);
          return;
        }
        const currentDescription = currentIssueResult.value.description ?? '';
        finalDescription = currentDescription ? `${currentDescription}\n\n${md}` : md;
      }
    } else {
      // Non-image: doesn't affect the description, so upload it concurrently
      // with resolveAndUpdate below instead of blocking on it first.
      pendingUpload = uploadAndClassify(client, opts.file);
    }
  }

  const updatePromise = ResultAsync.fromPromise(
    resolveAndUpdate(client, { ...opts, id: resolvedId }, finalDescription),
    coerceCliError
  );

  const [result, uploadOutcome] = pendingUpload
    ? await Promise.all([updatePromise, pendingUpload])
    : [await updatePromise, undefined];

  if (result.isErr()) {
    exitError(result.error);
    return;
  }

  const issue = result.value;
  renderIssue(issue, opts.plain);

  if (uploadOutcome) {
    // The update already succeeded by the time the concurrent upload settles,
    // so an upload failure here is a warning, not a hard error.
    if (uploadOutcome.isErr()) {
      console.error(pc.yellow(`Warning: file upload failed: ${uploadOutcome.error.message}`));
    } else {
      fileOutcome = uploadOutcome.value;
    }
  }

  // Best-effort: register a non-image upload as a real attachment on the
  // resource tab. Images were already embedded above.
  await attachIfNonImage(client, resolvedId, fileOutcome);
}
