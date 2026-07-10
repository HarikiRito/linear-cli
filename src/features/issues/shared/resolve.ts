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
