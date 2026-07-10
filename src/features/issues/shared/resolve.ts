import { type LinearClient, LinearError } from '@linear/sdk';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { getRequestFn } from '../../../lib/client/index.js';
import {
  getGlobalConfigPath,
  getProjectConfigPath,
  type LinearConfig,
  readConfig,
} from '../../../lib/config-file.js';
import {
  AmbiguousMatchError,
  type CliError,
  coerceCliError,
  mapLinearError,
  NotFoundError,
  ValidationError,
} from '../../../lib/errors.js';
import { findProjectRoot } from '../../../lib/scope.js';
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

/** Case-insensitive exact-match check against any of a set of optional string fields. */
function matchesAny(values: (string | null | undefined)[], target: string): boolean {
  const lower = target.toLowerCase();
  return values.some((v) => (v ?? '').toLowerCase() === lower);
}

/**
 * Match nodes via an arbitrary predicate, then resolve to a single id: zero
 * matches → NotFoundError, exactly one → its id, more than one → AmbiguousMatchError.
 */
function findOneByPredicate<T extends { id: string; name?: string | undefined }>(
  entityType: string,
  value: string,
  nodes: T[],
  predicate: (n: T) => boolean
): ResultAsync<string, CliError> {
  const matches = nodes.filter(predicate);
  if (matches.length === 0) return errAsync(new NotFoundError(entityType, value));
  if (matches.length === 1) return okAsync(matches[0].id);
  return errAsync(new AmbiguousMatchError(entityType, value, matches));
}

/** Like findOneByPredicate, but matches via a single case-insensitive exact `name` field. */
function findOne<T extends { id: string; name?: string | undefined }>(
  entityType: string,
  value: string,
  nodes: T[]
): ResultAsync<string, CliError> {
  return findOneByPredicate(entityType, value, nodes, (n) => matchesAny([n.name], value));
}

/**
 * Generic resolve helper: short-circuit on ID, otherwise fetch nodes via
 * fetchNodes and resolve the unique match via predicate. Used for entity types
 * that may have multiple human-readable identifiers (e.g. team key + name,
 * user name + displayName + email) — any exact match wins.
 */
function resolveByKeyOrId<TNode extends { id: string; name?: string | undefined }>(
  input: string,
  entityType: string,
  fetchNodes: () => Promise<{ nodes: TNode[] }>,
  predicate: (n: TNode) => boolean
): ResultAsync<string, CliError> {
  if (looksLikeId(input)) return okAsync(input);
  return ResultAsync.fromPromise(
    fetchNodes().then((c) => c.nodes),
    (e) => mapLinearError(e)
  ).andThen((nodes) => findOneByPredicate(entityType, input, nodes, predicate));
}

/** Generic helper: short-circuit on ID, otherwise fetch nodes and find by name. */
function resolveByName<TNode extends { id: string; name?: string | undefined }>(
  input: string,
  entityType: string,
  fetchNodes: () => Promise<{ nodes: TNode[] }>
): ResultAsync<string, CliError> {
  return resolveByKeyOrId(input, entityType, fetchNodes, (n) => matchesAny([n.name], input));
}

/**
 * Resolve a team by human-readable identifier first (key OR name, exact match
 * case-insensitively), falling back to a UUID/node-ID passthrough only when the
 * input already looks like an ID. Teams have a short `key` (e.g. "ENG") distinct
 * from their display `name` (e.g. "Engineering") — both must be checked, since a
 * key rarely matches the name filter used by the generic resolveByName helper.
 */
export function resolveTeam(input: string, client: LinearClient): ResultAsync<string, CliError> {
  return resolveByKeyOrId(
    input,
    'team',
    () =>
      client.teams({
        filter: {
          or: [{ key: { eqIgnoreCase: input } }, { name: { containsIgnoreCase: input } }],
        },
      }),
    (n) => matchesAny([n.key, n.name], input)
  );
}

/**
 * Resolve a config value from precedence chain:
 * env var → project config → global config → null
 */
function resolveConfigValue(envVar: string, key: keyof LinearConfig): string | null {
  const envVal = process.env[envVar];
  if (envVal) return envVal;
  const projectRoot = findProjectRoot(process.cwd());
  if (projectRoot) {
    const projectConfig = readConfig(getProjectConfigPath(projectRoot));
    if (projectConfig[key]) return projectConfig[key]!;
  }
  const globalConfig = readConfig(getGlobalConfigPath());
  if (globalConfig[key]) return globalConfig[key]!;
  return null;
}

/**
 * Resolve team ID from precedence chain (no API lookup):
 * env LINEAR_TEAM_ID → project config team_id → global config team_id → null
 */
export function getDefaultTeamId(): string | null {
  return resolveConfigValue('LINEAR_TEAM_ID', 'team_id');
}

/**
 * Resolve workspace from precedence chain:
 * env LINEAR_WORKSPACE → project config workspace → global config workspace → null
 */
export function getDefaultWorkspace(): string | null {
  return resolveConfigValue('LINEAR_WORKSPACE', 'workspace');
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

/**
 * Resolve a user by human-readable identifier first (name, display name, OR email,
 * exact match case-insensitively), falling back to a UUID/node-ID passthrough only
 * when the input already looks like an ID. Supports "me" as a shortcut for the viewer.
 */
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
  return resolveByKeyOrId(
    input,
    'user',
    () =>
      client.users({
        filter: {
          or: [
            { name: { containsIgnoreCase: input } },
            { displayName: { containsIgnoreCase: input } },
            { email: { containsIgnoreCase: input } },
          ],
        },
      }),
    (n) => matchesAny([n.name, n.displayName, n.email], input)
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

/**
 * Resolve an issue identifier:
 * - Bare number (e.g. "123") → look up default team key and return "TEAM-123"
 * - Full identifier (e.g. "ENG-123") or UUID/node ID → passthrough
 */
export function resolveIssueIdentifier(
  input: string,
  client: LinearClient
): ResultAsync<string, CliError> {
  if (/^\d+$/.test(input)) {
    const teamId = getDefaultTeamId();
    if (!teamId) {
      return errAsync(
        new ValidationError(
          'No default team configured. Set a default team with LINEAR_TEAM_ID, or configure team_id in your Linear config.'
        )
      );
    }
    return ResultAsync.fromPromise(
      client.team(teamId).then((team) => {
        if (!team.key) {
          throw new ValidationError(
            `Team with id "${teamId}" has no key configured; cannot expand bare issue number "${input}"`
          );
        }
        return `${team.key}-${input}`;
      }),
      coerceCliError
    );
  }
  return okAsync(input);
}

/**
 * True if the message text indicates a "not found" failure specifically
 * about an issue, rather than any error that happens to contain the bare
 * substring "not found" (e.g. a team/workspace/rate-limit error). Requires
 * both an explicit not-found phrase AND a mention of "issue" so unrelated
 * errors aren't mislabeled — see H-163 follow-up.
 */
function isIssueNotFoundMessage(message: string): boolean {
  return /not found/i.test(message) && /issue/i.test(message);
}

/**
 * Map a raw error from a comment mutation/query (createComment, ListComments)
 * to a clear NotFoundError('issue', issueId) when it indicates the referenced
 * issue doesn't exist, otherwise delegate to mapLinearError for generic
 * handling.
 *
 * Prefers the Linear SDK's structured error shape — `LinearError.errors[]`
 * carries a GraphQL `path` per error, so when that path references the issue
 * field we trust it directly. Falls back to text-matching the message only
 * when no structured signal is available (e.g. non-SDK errors, or the plain
 * `Error` shape used in tests) — see H-163, code review follow-up.
 */
export function mapIssueNotFoundError(e: unknown, issueId: string): CliError {
  if (e instanceof LinearError) {
    const graphQLErrors = e.errors ?? [];
    const structuredIssueNotFound = graphQLErrors.some((ge) => {
      const pathMentionsIssue = ge.path?.some((p) => /issue/i.test(p)) ?? false;
      return pathMentionsIssue && isIssueNotFoundMessage(ge.message);
    });
    if (structuredIssueNotFound) {
      return new NotFoundError('issue', issueId);
    }
  }
  if (e instanceof Error && isIssueNotFoundMessage(e.message)) {
    return new NotFoundError('issue', issueId);
  }
  return mapLinearError(e);
}
