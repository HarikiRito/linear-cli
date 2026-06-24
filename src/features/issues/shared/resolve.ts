import type { LinearClient } from '@linear/sdk';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { getRequestFn } from '../../../lib/client/index.js';
import {
  AmbiguousMatchError,
  type CliError,
  coerceCliError,
  mapLinearError,
  NotFoundError,
} from '../../../lib/errors.js';
import { PROJECT_MILESTONES_QUERY } from './queries.js';

/**
 * Returns true if the input looks like a Linear UUID or node ID,
 * meaning it can be used directly without a name lookup.
 */
export function looksLikeId(input: string): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) return true;
  // Linear node ID: 20+ chars, no dashes — distinguishes from identifiers like ENG-123
  if (/^[A-Za-z0-9_]{20,}$/.test(input)) return true;
  return false;
}

function findOne<T extends { id: string; name?: string | undefined }>(
  entityType: string,
  value: string,
  nodes: T[]
): ResultAsync<string, CliError> {
  const lower = value.toLowerCase();
  const matches = nodes.filter((n) => (n.name ?? '').toLowerCase() === lower);
  if (matches.length === 0) return errAsync(new NotFoundError(entityType, value));
  if (matches.length === 1) return okAsync(matches[0].id);
  return errAsync(new AmbiguousMatchError(entityType, value, matches));
}

/** Generic helper: short-circuit on ID, otherwise fetch nodes and find by name. */
function resolveByName<TNode extends { id: string; name?: string | undefined }>(
  input: string,
  entityType: string,
  fetchNodes: () => Promise<{ nodes: TNode[] }>
): ResultAsync<string, CliError> {
  if (looksLikeId(input)) return okAsync(input);
  return ResultAsync.fromPromise(
    fetchNodes().then((c) => c.nodes),
    (e) => mapLinearError(e)
  ).andThen((nodes) => findOne(entityType, input, nodes));
}

export function resolveTeam(input: string, client: LinearClient): ResultAsync<string, CliError> {
  return resolveByName(input, 'team', () =>
    client.teams({ filter: { name: { containsIgnoreCase: input } } })
  );
}

export function resolveProject(input: string, client: LinearClient): ResultAsync<string, CliError> {
  return resolveByName(input, 'project', () =>
    client.projects({ filter: { name: { containsIgnoreCase: input } } })
  );
}

export function resolveMilestone(
  input: string,
  projectId: string,
  client: LinearClient
): ResultAsync<string, CliError> {
  if (looksLikeId(input)) return okAsync(input);
  const requestFn = getRequestFn(client);
  return ResultAsync.fromPromise(
    requestFn(PROJECT_MILESTONES_QUERY, { id: projectId }).then((data) => {
      if (!data.project) throw new NotFoundError('project', projectId);
      return data.project.projectMilestones.nodes;
    }),
    (e) => coerceCliError(e)
  ).andThen((nodes) => findOne('milestone', input, nodes));
}

export function resolveAssignee(
  input: string,
  client: LinearClient
): ResultAsync<string, CliError> {
  if (input === 'me') {
    return ResultAsync.fromPromise(
      client.viewer.then((v) => v.id),
      (e) => mapLinearError(e)
    );
  }
  return resolveByName(input, 'user', () =>
    client.users({ filter: { name: { containsIgnoreCase: input } } })
  );
}

export function resolveLabel(input: string, client: LinearClient): ResultAsync<string, CliError> {
  return resolveByName(input, 'label', () =>
    client.issueLabels({ filter: { name: { containsIgnoreCase: input } } })
  );
}

export function resolveLabels(
  inputs: string[],
  client: LinearClient
): ResultAsync<string[], CliError> {
  if (inputs.length === 0) return okAsync([]);
  return ResultAsync.fromPromise<string[], CliError>(
    Promise.all(
      inputs.map((input) =>
        resolveLabel(input, client).then((r) => {
          if (r.isErr()) throw r.error;
          return r.value;
        })
      )
    ) as Promise<string[]>,
    (e) => coerceCliError(e)
  );
}

export function resolveWorkflowState(
  input: string,
  teamId: string,
  client: LinearClient
): ResultAsync<string, CliError> {
  return resolveByName(input, 'state', () =>
    client.workflowStates({
      filter: {
        name: { containsIgnoreCase: input },
        team: { id: { eq: teamId } },
      },
    })
  );
}

export function resolveCycle(
  input: string,
  teamId: string,
  client: LinearClient
): ResultAsync<string, CliError> {
  return resolveByName(input, 'cycle', () =>
    client.cycles({
      filter: {
        name: { containsIgnoreCase: input },
        team: { id: { eq: teamId } },
      },
    })
  );
}
