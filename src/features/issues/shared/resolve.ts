import { type LinearClient, LinearError } from '@linear/sdk';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { getRequestFn } from '../../../lib/client/index.js';
import {
  type DefaultTeam,
  getGlobalConfigPath,
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
import { getEntry } from '../../keepalive/registry.js';
import { ISSUE_PROJECT_SCOPE_QUERY, PROJECT_MILESTONES_QUERY } from './queries.js';

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
 * Scalar (string-valued) LinearConfig keys — excludes structured fields like
 * `team` (nested table) and `projects` (array of tables), which have their
 * own dedicated resolution helpers (see resolveDefaultTeam and
 * getDefaultProjectIds), since this precedence chain only handles single
 * string values.
 */
type ScalarConfigKey = 'workspace';

interface MergedConfigs {
  /** Team bound to the cwd-linked directory (registry entry), if any. */
  linkedTeam: DefaultTeam | null;
  /** Project selection bound to the cwd-linked directory (registry entry), if any. */
  linkedProjects: { id: string; name: string }[] | null;
  globalConfig: LinearConfig;
}

/**
 * Resolve the cwd-linked registry entry (if any) once and read the global
 * config.toml once, returning both. Shared by resolveConfigValue() (scalar
 * keys) and getDefaultProjectIds() (array key) so neither duplicates the
 * project-root walk or the file reads. Per-process memoization avoids
 * re-walking the directory tree / re-reading + re-parsing TOML when these
 * helpers are invoked multiple times within a single CLI invocation.
 */
const mergedConfigsCache = new Map<string, MergedConfigs>();

function readMergedConfigs(): MergedConfigs {
  const projectRoot = findProjectRoot(process.cwd());
  const entry = projectRoot ? getEntry(projectRoot) : undefined;
  const globalConfigPath = getGlobalConfigPath();

  const cacheKey = `${entry?.root ?? ''} ${globalConfigPath}`;
  const cached = mergedConfigsCache.get(cacheKey);
  if (cached) return cached;

  const configs: MergedConfigs = {
    linkedTeam: entry?.team ?? null,
    linkedProjects: entry?.projects ?? null,
    globalConfig: readConfig(globalConfigPath),
  };
  mergedConfigsCache.set(cacheKey, configs);
  return configs;
}

/**
 * Resolve a scalar config value from precedence chain:
 * env var → global config → null
 */
function resolveConfigValue(envVar: string, key: ScalarConfigKey): string | null {
  const envVal = process.env[envVar];
  if (envVal) return envVal;
  return readMergedConfigs().globalConfig[key] ?? null;
}

/**
 * Resolve the full default `team` table (no env var, no API lookup): the
 * cwd-linked registry entry `team` only — global config `team` is no longer
 * read (link-only model). Sibling to resolveConfigValue(), which only handles
 * scalar (string) keys — `team` is a nested `{id, key}` table so it needs its
 * own precedence walk. Exported for direct testing of the precedence behavior.
 */
export function resolveDefaultTeam(): DefaultTeam | null {
  return readMergedConfigs().linkedTeam;
}

/**
 * Resolve team ID from precedence chain (no API lookup):
 * env LINEAR_TEAM_ID → linked registry entry team.id → null
 *
 * The env var, when set, bypasses the `team` table entirely (same precedence
 * as before this field became a nested table).
 */
export function getDefaultTeamId(): string | null {
  const envVal = process.env.LINEAR_TEAM_ID;
  if (envVal) return envVal;
  const team = resolveDefaultTeam();
  return team ? team.id : null;
}

/**
 * Resolve workspace from precedence chain:
 * env LINEAR_WORKSPACE → global config workspace → null
 */
export function getDefaultWorkspace(): string | null {
  return resolveConfigValue('LINEAR_WORKSPACE', 'workspace');
}

/**
 * Resolve the cwd-linked directory's hard project scope (no env var, no API
 * lookup): registry entry `projects` → undefined. An empty/missing selection
 * is treated as "no scope" (unlinked dirs and links without a project
 * selection both fall through to undefined) — existing behavior is
 * unchanged for those. When non-undefined, callers must treat it as a hard
 * scope, not just a default (see getDefaultProjectIds and resolveIssueIdentifier).
 */
export function getScopedProjectIds(): string[] | undefined {
  const { linkedProjects } = readMergedConfigs();
  return linkedProjects && linkedProjects.length > 0 ? linkedProjects.map((p) => p.id) : undefined;
}

/**
 * Resolve default project IDs (no env var, no API lookup): cwd-linked
 * workspace scope → global config `projects` → undefined. An empty array is
 * treated as unset (falls through) rather than as an explicit empty
 * selection. `projects` entries are `{id, name}` tables — only the bare `id`
 * is extracted here so this keeps returning the same `string[] | undefined`
 * shape callers relied on before `project_ids` became a structured array of
 * tables.
 */
export function getDefaultProjectIds(): string[] | undefined {
  const scoped = getScopedProjectIds();
  if (scoped) return scoped;
  const { globalConfig } = readMergedConfigs();
  if (globalConfig.projects && globalConfig.projects.length > 0) {
    return globalConfig.projects.map((p) => p.id);
  }
  return undefined;
}

/**
 * Error message shown when a command requires a project (--project) but
 * none is available. Shared by read-path commands that still span all
 * configured default project ids (see buildDefaultProjectFilter) — mutation
 * / single-project commands should use projectRequiredError() instead, since
 * they no longer default to a project at all (see resolveDefaultProjectId).
 */
export const DEFAULT_PROJECT_REQUIRED_ERROR =
  '--project is required (no default project configured)';

/**
 * Error for commands that require a single --project and got neither an
 * explicit value nor (since defaulting was removed) a configured default.
 * Appends the cwd-linked scope's project names as a hint when one is active,
 * since silently picking one of several scoped projects is exactly what
 * resolveDefaultProjectId() no longer does.
 */
export function projectRequiredError(command: string): ValidationError {
  const { linkedProjects } = readMergedConfigs();
  if (linkedProjects && linkedProjects.length > 0) {
    const names = linkedProjects.map((p) => p.name).join(', ');
    return new ValidationError(
      `--project is required for ${command}. Scoped projects: ${names} — pass --project <name-or-id>`
    );
  }
  return new ValidationError(`--project is required for ${command}`);
}

/**
 * Resolve the effective single project ID for commands that accept a single
 * --project flag: the already-resolved explicit value when the caller
 * provided one, otherwise undefined. No longer falls back to a configured
 * default (scoped or global config) — silently picking one of several
 * scoped projects for a mutation risked writing to the wrong one, so callers
 * must now require --project explicitly (see projectRequiredError).
 */
export function resolveDefaultProjectId(explicitProjectId: string | undefined): string | undefined {
  return explicitProjectId;
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
 * Expand a bare issue number (e.g. "123") to "TEAM-123" via the default team
 * key; a full identifier (e.g. "ENG-123") or UUID/node ID passes through.
 */
function expandIssueIdentifier(input: string, client: LinearClient): ResultAsync<string, CliError> {
  if (/^\d+$/.test(input)) {
    const teamId = getDefaultTeamId();
    if (!teamId) {
      return errAsync(
        new ValidationError(
          'No default team configured. Set a default team with LINEAR_TEAM_ID, or run `linear team select` / `linear login` to configure a default team.'
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
 * Verify the resolved issue's project is one of the cwd-linked workspace's
 * scoped projects, reporting NotFoundError('issue', ...) rather than leaking
 * that an out-of-scope issue exists — same shape as a genuine miss.
 */
function assertIssueInScope(
  resolvedId: string,
  scopedProjectIds: string[],
  client: LinearClient
): ResultAsync<string, CliError> {
  const requestFn = getRequestFn(client);
  return ResultAsync.fromPromise(
    requestFn(ISSUE_PROJECT_SCOPE_QUERY, { id: resolvedId }).then((data) => {
      if (!data.issue) throw new NotFoundError('issue', resolvedId);
      return data.issue.project?.id;
    }),
    (e) => mapIssueNotFoundError(e, resolvedId)
  ).andThen((projectId) => {
    if (projectId && scopedProjectIds.includes(projectId)) return okAsync(resolvedId);
    return errAsync(new NotFoundError('issue', resolvedId));
  });
}

/**
 * Resolve an issue identifier, then — when the cwd is linked to a workspace
 * with a project selection — hard-scope it: an identifier resolving to an
 * issue outside the scoped projects is reported as not found.
 */
export function resolveIssueIdentifier(
  input: string,
  client: LinearClient
): ResultAsync<string, CliError> {
  const resolved = expandIssueIdentifier(input, client);
  const scopedProjectIds = getScopedProjectIds();
  if (!scopedProjectIds) return resolved;
  return resolved.andThen((id) => assertIssueInScope(id, scopedProjectIds, client));
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
