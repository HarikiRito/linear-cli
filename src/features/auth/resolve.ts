import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { type CliError, coerceCliError, UnauthenticatedError } from '../../lib/errors.js';
import { findProjectRoot } from '../../lib/scope.js';
import { getEntry } from '../keepalive/registry.js';
import { listWorkspaceIds } from './credentials.js';
import {
  type ResolvedCredential,
  resolveSessionWithRefresh,
  resolveWorkspaceCredential,
} from './refresh.js';
import { getWorkspaceHint } from './workspace-hint.js';
import {
  describeStoredWorkspaces,
  HOW_TO_CHOOSE,
  resolveHintWorkspaceId,
} from './workspace-lookup.js';

export { type ResolvedCredential, resolveSessionWithRefresh, resolveWorkspaceCredential };

export interface ResolveOptions {
  apiKey?: string;
  token?: string;
  /** Retained for callers (e.g. whoami passes false); no interactive fallback remains. */
  allowInteractive?: boolean;
  forceRefresh?: boolean;
  /**
   * Pre-resolved project root, for callers that already computed it — avoids a
   * redundant findProjectRoot(process.cwd()) directory walk for the same cwd.
   * When omitted, resolved internally.
   */
  projectRoot?: string | null;
}

/**
 * Explicit LINEAR_WORKSPACE env override. Wins-or-fails: never falls through
 * to anything else when the requested credential is absent.
 */
function resolveEnvWorkspace(
  forceRefresh?: boolean
): ResultAsync<ResolvedCredential | null, CliError> {
  const configured = process.env.LINEAR_WORKSPACE;
  if (!configured) return okAsync(null);
  return resolveWorkspaceCredential(configured, forceRefresh).andThen((cred) =>
    cred
      ? okAsync(cred)
      : errAsync(
          new UnauthenticatedError(
            `No stored credential for LINEAR_WORKSPACE '${configured}'. Run \`linear login\` to authenticate it.`
          )
        )
  );
}

/**
 * Link-only store lookup:
 * 1. cwd (or an ancestor) linked in the registry → that workspace's credential
 *    (falls through when linked but no stored credential)
 * 2. LINEAR_WORKSPACE env → that workspace's credential (explicit override,
 *    wins-or-fails)
 * Returns null when neither applies.
 */
function resolveFromStore(opts: ResolveOptions): ResultAsync<ResolvedCredential | null, CliError> {
  const { forceRefresh } = opts;
  const projectRoot =
    opts.projectRoot !== undefined ? opts.projectRoot : findProjectRoot(process.cwd());
  if (projectRoot) {
    const entry = getEntry(projectRoot);
    if (entry?.workspace) {
      return resolveWorkspaceCredential(entry.workspace, forceRefresh).andThen((cred) => {
        if (cred) return okAsync(cred);
        return resolveEnvWorkspace(forceRefresh);
      });
    }
  }
  return resolveEnvWorkspace(forceRefresh);
}

/**
 * Last resorts when no link or LINEAR_WORKSPACE applies: the workspace named by
 * the command's team key / issue URL hint, else the only stored workspace.
 * A hint that matches nothing is an error, except a team hint with one stored workspace,
 * which uses it without any lookup.
 */
function resolveFromHintOrSingle(
  forceRefresh?: boolean
): ResultAsync<ResolvedCredential, CliError> {
  return ResultAsync.fromPromise(listWorkspaceIds(), coerceCliError)
    .andThen(pickWorkspaceId)
    .andThen((id) => resolveWorkspaceCredential(id, forceRefresh))
    .andThen((cred) => (cred ? okAsync(cred) : errAsync(notAuthenticated())));
}

function notAuthenticated(): UnauthenticatedError {
  return new UnauthenticatedError('Not authenticated. Run `linear login` to authenticate.');
}

function pickWorkspaceId(ids: string[]): ResultAsync<string, CliError> {
  if (ids.length === 0) return errAsync(notAuthenticated());
  const hint = getWorkspaceHint();
  // A team hint may be a team name or UUID, so with one workspace let the API judge it.
  if (ids.length === 1 && hint?.kind !== 'url') return okAsync(ids[0]);
  if (hint) return resolveHintWorkspaceId(hint);
  return ResultAsync.fromPromise(describeStoredWorkspaces(ids), coerceCliError).andThen((names) =>
    errAsync(
      new UnauthenticatedError(
        `Multiple workspaces are stored and none was selected: ${names}. ${HOW_TO_CHOOSE}`
      )
    )
  );
}

/**
 * Explicit credential material only — rules 1-4: --api-key flag, --token flag,
 * LINEAR_API_KEY env, LINEAR_ACCESS_TOKEN env. Returns null when absent so
 * callers can fall through to store resolution.
 */
export function resolveExplicitCredential(opts: ResolveOptions): ResolvedCredential | null {
  if (opts.apiKey) return { type: 'apiKey', value: opts.apiKey };
  if (opts.token) return { type: 'accessToken', value: opts.token };
  if (process.env.LINEAR_API_KEY) return { type: 'apiKey', value: process.env.LINEAR_API_KEY };
  if (process.env.LINEAR_ACCESS_TOKEN) {
    return { type: 'accessToken', value: process.env.LINEAR_ACCESS_TOKEN };
  }
  return null;
}

/**
 * Resolve a single session to a credential. Strict precedence — no silent
 * fallbacks:
 * 1. --api-key flag → apiKey
 * 2. --token flag → accessToken
 * 3. LINEAR_API_KEY env → apiKey
 * 4. LINEAR_ACCESS_TOKEN env → accessToken
 * 5. registry: cwd-linked workspace credential, incl. the main repo's link from
 *    inside a git worktree (refresh + writeback)
 * 6. LINEAR_WORKSPACE env (explicit per-invocation override)
 * 7. team key / issue URL hint of the running command, looked up across stored
 *    workspaces (see workspace-lookup.ts)
 * 8. the only stored workspace, when there is no hint
 * 9. UnauthenticatedError (nothing stored) or an error listing the candidates
 */
export function resolveCredential(
  opts: ResolveOptions = {}
): ResultAsync<ResolvedCredential, CliError> {
  // 1-4) Explicit flag / env var
  const explicit = resolveExplicitCredential(opts);
  if (explicit) return okAsync(explicit);

  // 5-6) Registry link → LINEAR_WORKSPACE env override; 7-9) hint / single workspace
  return resolveFromStore(opts).andThen((cred) =>
    cred ? okAsync(cred) : resolveFromHintOrSingle(opts.forceRefresh)
  );
}
