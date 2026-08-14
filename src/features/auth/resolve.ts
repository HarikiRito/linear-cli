import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import {
  AuthError,
  type CliError,
  coerceCliError,
  toError,
  UnauthenticatedError,
} from '../../lib/errors.js';
import { findProjectRoot } from '../../lib/scope.js';
import { getEntry } from '../keepalive/registry.js';
import {
  listWorkspaceIds,
  readWorkspaceCredential,
  writeWorkspaceCredential,
} from './credentials.js';
import { refreshAccessToken } from './oauth.js';
import { isApiKeySession, isOAuthSession, type Session } from './session.js';

export interface ResolvedCredential {
  type: 'apiKey' | 'accessToken';
  value: string;
}

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
 * Resolve a single session to a credential, refreshing OAuth tokens when
 * expired. Rotated tokens are written back to the workspace credential the
 * session came from (no cross-writing).
 */
function resolveSessionWithRefresh(
  session: Session,
  workspaceId: string,
  forceRefresh?: boolean
): ResultAsync<ResolvedCredential, CliError> {
  if (isApiKeySession(session)) {
    return okAsync({ type: 'apiKey' as const, value: session.apiKey });
  }
  if (isOAuthSession(session)) {
    // 60-second skew buffer: refresh proactively before actual expiry
    const needsRefresh =
      forceRefresh || (session.expiresAt != null && Date.now() >= session.expiresAt - 60_000);
    if (needsRefresh) {
      return refreshAccessToken(session.refreshToken).andThen((refreshed) =>
        ResultAsync.fromPromise(
          writeWorkspaceCredential(workspaceId, {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            expiresAt: refreshed.expiresAt,
            lastRefreshAt: Date.now(),
          }),
          (e) => new AuthError(toError(e).message)
        ).map(() => ({ type: 'accessToken' as const, value: refreshed.accessToken }))
      );
    }
    return okAsync({ type: 'accessToken' as const, value: session.accessToken });
  }
  return errAsync(new UnauthenticatedError());
}

/**
 * Look up a stored workspace credential by id and resolve it (with refresh +
 * writeback). Returns null when no credential exists for the id.
 */
function resolveWorkspace(
  workspaceId: string,
  forceRefresh?: boolean
): ResultAsync<ResolvedCredential | null, CliError> {
  return ResultAsync.fromPromise(
    readWorkspaceCredential(workspaceId),
    (e) => new AuthError(toError(e).message)
  ).andThen((session) =>
    session ? resolveSessionWithRefresh(session, workspaceId, forceRefresh) : okAsync(null)
  );
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
  return ResultAsync.fromPromise(
    readWorkspaceCredential(configured),
    (e) => new AuthError(toError(e).message)
  ).andThen((session) =>
    session ? resolveSessionWithRefresh(session, configured, forceRefresh) : okAsync(null)
  );
}

/**
 * Link-only store lookup:
 * 1. cwd (or an ancestor) linked in the registry → that workspace's credential
 *    (falls through when linked but no stored credential)
 * 2. LINEAR_WORKSPACE env → that workspace's credential (explicit override,
 *    wins-or-fails)
 * Returns null when neither yields a stored credential.
 */
function resolveFromStore(opts: ResolveOptions): ResultAsync<ResolvedCredential | null, CliError> {
  const { forceRefresh } = opts;
  const projectRoot =
    opts.projectRoot !== undefined ? opts.projectRoot : findProjectRoot(process.cwd());
  if (projectRoot) {
    const entry = getEntry(projectRoot);
    if (entry?.workspace) {
      return resolveWorkspace(entry.workspace, forceRefresh).andThen((cred) => {
        if (cred) return okAsync(cred);
        return resolveEnvWorkspace(forceRefresh);
      });
    }
  }
  return resolveEnvWorkspace(forceRefresh);
}

/**
 * Context-aware unauthenticated hint: no stored credentials at all → point at
 * `linear login`; credentials exist but cwd isn't linked and no explicit
 * LINEAR_WORKSPACE matched → point at `linear workspace select`.
 */
async function buildUnauthenticatedError(): Promise<never> {
  const ids = await listWorkspaceIds();
  if (ids.length === 0) {
    throw new UnauthenticatedError('Not authenticated. Run `linear login` to authenticate.');
  }
  throw new UnauthenticatedError(
    "This directory isn't linked to a workspace. Run `linear workspace select` to link it (or `linear login` to authenticate a new workspace)."
  );
}

/**
 * Resolve a single session to a credential. Strict precedence — no silent
 * fallbacks:
 * 1. --api-key flag → apiKey
 * 2. --token flag → accessToken
 * 3. LINEAR_API_KEY env → apiKey
 * 4. LINEAR_ACCESS_TOKEN env → accessToken
 * 5. registry: cwd-linked workspace credential (refresh + writeback)
 * 6. LINEAR_WORKSPACE env (explicit per-invocation override)
 * 7. UnauthenticatedError with a context-aware hint
 */
export function resolveCredential(
  opts: ResolveOptions = {}
): ResultAsync<ResolvedCredential, CliError> {
  // 1) Explicit flag
  if (opts.apiKey) {
    return okAsync({ type: 'apiKey', value: opts.apiKey });
  }
  if (opts.token) {
    return okAsync({ type: 'accessToken', value: opts.token });
  }

  // 2) Env var
  if (process.env.LINEAR_API_KEY) {
    return okAsync({ type: 'apiKey', value: process.env.LINEAR_API_KEY });
  }
  if (process.env.LINEAR_ACCESS_TOKEN) {
    return okAsync({ type: 'accessToken', value: process.env.LINEAR_ACCESS_TOKEN });
  }

  // 3) Registry (cwd-linked workspace) → LINEAR_WORKSPACE env override
  return resolveFromStore(opts).andThen((cred) => {
    if (cred) return okAsync(cred);

    // 4) Unlinked / nothing stored — context-aware UnauthenticatedError
    return ResultAsync.fromPromise(buildUnauthenticatedError(), coerceCliError);
  });
}
