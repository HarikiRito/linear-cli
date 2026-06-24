import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { AmbiguousMatchError, type CliError, NotFoundError, mapLinearError } from '../../../lib/errors.js';
import type { RequestFn } from '../../../lib/pagination.js';

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

function findOne<T extends { id: string; name: string }>(
  entityType: string,
  value: string,
  nodes: T[]
): ResultAsync<string, CliError> {
  const lower = value.toLowerCase();
  const matches = nodes.filter((n) => n.name.toLowerCase() === lower);
  if (matches.length === 0) return errAsync(new NotFoundError(entityType, value));
  if (matches.length === 1) return okAsync(matches[0].id);
  return errAsync(new AmbiguousMatchError(entityType, value, matches));
}

function fetchNodes<T extends { id: string; name: string }>(
  requestFn: RequestFn,
  query: string,
  vars: Record<string, unknown>,
  extract: (data: unknown) => T[]
): ResultAsync<T[], CliError> {
  return ResultAsync.fromPromise(
    requestFn(query, vars).then(extract),
    (e) => mapLinearError(e)
  );
}

export function resolveTeam(input: string, requestFn: RequestFn): ResultAsync<string, CliError> {
  if (looksLikeId(input)) return okAsync(input);
  return fetchNodes(
    requestFn,
    `query ResolveTeam($name: String!) { teams(filter: { name: { containsIgnoreCase: $name } }) { nodes { id name } } }`,
    { name: input },
    (d) => (d as { teams: { nodes: Array<{ id: string; name: string }> } }).teams.nodes
  ).andThen((nodes) => findOne('team', input, nodes));
}

export function resolveProject(input: string, requestFn: RequestFn): ResultAsync<string, CliError> {
  if (looksLikeId(input)) return okAsync(input);
  return fetchNodes(
    requestFn,
    `query ResolveProject($name: String!) { projects(filter: { name: { containsIgnoreCase: $name } }) { nodes { id name } } }`,
    { name: input },
    (d) => (d as { projects: { nodes: Array<{ id: string; name: string }> } }).projects.nodes
  ).andThen((nodes) => findOne('project', input, nodes));
}

export function resolveMilestone(
  input: string,
  projectId: string,
  requestFn: RequestFn
): ResultAsync<string, CliError> {
  if (looksLikeId(input)) return okAsync(input);
  return fetchNodes(
    requestFn,
    `query ResolveMilestone($projectId: ID!) { project(id: $projectId) { milestones { nodes { id name } } } }`,
    { projectId },
    (d) =>
      (d as { project: { milestones: { nodes: Array<{ id: string; name: string }> } } }).project
        .milestones.nodes
  ).andThen((nodes) => findOne('milestone', input, nodes));
}

export function resolveAssignee(input: string, requestFn: RequestFn): ResultAsync<string, CliError> {
  if (looksLikeId(input)) return okAsync(input);
  return fetchNodes(
    requestFn,
    `query ResolveAssignee($name: String!) { users(filter: { name: { containsIgnoreCase: $name } }) { nodes { id name } } }`,
    { name: input },
    (d) => (d as { users: { nodes: Array<{ id: string; name: string }> } }).users.nodes
  ).andThen((nodes) => findOne('user', input, nodes));
}

export function resolveLabel(input: string, requestFn: RequestFn): ResultAsync<string, CliError> {
  if (looksLikeId(input)) return okAsync(input);
  return fetchNodes(
    requestFn,
    `query ResolveLabel($name: String!) { issueLabels(filter: { name: { containsIgnoreCase: $name } }) { nodes { id name } } }`,
    { name: input },
    (d) =>
      (d as { issueLabels: { nodes: Array<{ id: string; name: string }> } }).issueLabels.nodes
  ).andThen((nodes) => findOne('label', input, nodes));
}

export function resolveLabels(
  inputs: string[],
  requestFn: RequestFn
): ResultAsync<string[], CliError> {
  if (inputs.length === 0) return okAsync([]);
  return ResultAsync.fromPromise<string[], CliError>(
    Promise.all(
      inputs.map((input) =>
        resolveLabel(input, requestFn).then((r) => {
          if (r.isErr()) throw r.error;
          return r.value;
        })
      )
    ) as Promise<string[]>,
    (e) => (e instanceof Error && 'kind' in e ? (e as CliError) : mapLinearError(e))
  );
}

export function resolveWorkflowState(
  input: string,
  teamId: string,
  requestFn: RequestFn
): ResultAsync<string, CliError> {
  if (looksLikeId(input)) return okAsync(input);
  return fetchNodes(
    requestFn,
    `query ResolveWorkflowState($teamId: String!) { team(id: $teamId) { states { nodes { id name } } } }`,
    { teamId },
    (d) =>
      (d as { team: { states: { nodes: Array<{ id: string; name: string }> } } }).team.states.nodes
  ).andThen((nodes) => findOne('state', input, nodes));
}

export function resolveCycle(
  input: string,
  teamId: string,
  requestFn: RequestFn
): ResultAsync<string, CliError> {
  if (looksLikeId(input)) return okAsync(input);
  return fetchNodes(
    requestFn,
    `query ResolveCycle($teamId: String!) { team(id: $teamId) { cycles { nodes { id name } } } }`,
    { teamId },
    (d) =>
      (d as { team: { cycles: { nodes: Array<{ id: string; name: string }> } } }).team.cycles.nodes
  ).andThen((nodes) => findOne('cycle', input, nodes));
}
