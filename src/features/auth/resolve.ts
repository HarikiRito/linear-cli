import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { getGlobalConfigPath, readConfig } from '../../lib/config-file.js';
import { AuthError, type CliError, toError, UnauthenticatedError } from '../../lib/errors.js';
import { findProjectRoot } from '../../lib/scope.js';
import { getEntry } from '../keepalive/registry.js';
import {
  listWorkspaceIds,
  readWorkspaceCredential,
  writeWorkspaceCredential,
} from './credentials.js';
import { runLoginFlow } from './login.js';
import { refreshAccessToken } from './oauth.js';
import { isApiKeySession, isOAuthSession, type Session } from './session.js';

export interface ResolvedCredential {
  type: 'apiKey' | 'accessToken';
  value: string;
}

export interface ResolveOptions {
  apiKey?: string;
  token?: string;
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
 * Registry + global-default-workspace lookup chain:
 * 1. cwd (or an ancestor) linked in the registry → that workspace's credential
 * 2. LINEAR_WORKSPACE env or global config `workspace` → that credential
 * 3. single-workspace store → the only credential
 * Returns null when no stored credential matches.
 */
function resolveFromStore(opts: ResolveOptions): ResultAsync<ResolvedCredential | null, CliError> {
  const { forceRefresh } = opts;
  const projectRoot =
    opts.projectRoot !== undefined ? opts.projectRoot : findProjectRoot(process.cwd());
  if (projectRoot) {
    const entry = getEntry(projectRoot);
    if (entry?.workspace) {
      return resolveWorkspace(entry.workspace, forceRefresh);
    }
  }
  return ResultAsync.fromPromise(
    (async (): Promise<string | null> => {
      // Malformed global config.toml must not block auth — tolerate it (only
      // the explicit LINEAR_WORKSPACE env remains authoritative in that case).
      let configured: string | undefined;
      try {
        configured = process.env.LINEAR_WORKSPACE ?? readConfig(getGlobalConfigPath()).workspace;
      } catch {
        configured = process.env.LINEAR_WORKSPACE;
      }
      if (configured) {
        // Explicit selection wins-or-fails: never fall through to another
        // stored workspace when the requested credential is absent.
        return (await readWorkspaceCredential(configured)) ? configured : null;
      }
      const ids = await listWorkspaceIds();
      return ids.length === 1 ? ids[0] : null;
    })(),
    (e) => new AuthError(toError(e).message)
  ).andThen((workspaceId) =>
    workspaceId ? resolveWorkspace(workspaceId, forceRefresh) : okAsync(null)
  );
}

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

  // 3) Registry (cwd-linked workspace) → global default workspace → auto single
  return resolveFromStore(opts).andThen((cred) => {
    if (cred) return okAsync(cred);

    // 4) Interactive fallback if TTY: log in, then re-resolve (no loop)
    if (opts.allowInteractive !== false && process.stdout.isTTY && process.stdin.isTTY) {
      return ResultAsync.fromPromise(
        (async (): Promise<ResolvedCredential> => {
          await runLoginFlow();
          const re = await resolveFromStore(opts);
          if (re.isErr()) throw re.error;
          if (re.value === null) throw new UnauthenticatedError();
          return re.value;
        })(),
        // Preserve real failures (e.g. a credential write error after login)
        // instead of masking every rejection as unauthenticated.
        (e) =>
          e instanceof Error && 'kind' in e ? (e as CliError) : new AuthError(toError(e).message)
      );
    }

    // 5) Non-TTY: return err
    return errAsync(new UnauthenticatedError());
  });
}
