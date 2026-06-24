import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { type CliError, UnauthenticatedError } from '../../lib/errors.js';
import { findProjectRoot } from '../../lib/scope.js';
import { runLoginFlow } from './login.js';
import { refreshAccessToken } from './oauth.js';
import {
  isApiKeySession,
  isOAuthSession,
  readProjectSession,
  readSession,
  type Session,
} from './session.js';

export interface ResolvedCredential {
  type: 'apiKey' | 'accessToken';
  value: string;
}

export interface ResolveOptions {
  apiKey?: string;
  token?: string;
  allowInteractive?: boolean;
}

/**
 * Resolve a single session to a credential, refreshing OAuth tokens when expired.
 * Returns null for apiKey sessions (never expires), or a ResultAsync for OAuth.
 * Actually returns a ResultAsync in all cases for uniform handling.
 */
function resolveSessionWithRefresh(session: Session): ResultAsync<ResolvedCredential, CliError> {
  if (isApiKeySession(session)) {
    return okAsync({ type: 'apiKey' as const, value: session.apiKey });
  }
  if (isOAuthSession(session)) {
    if (session.expiresAt && Date.now() >= session.expiresAt) {
      return refreshAccessToken(session.refreshToken).map((refreshed) => ({
        type: 'accessToken' as const,
        value: refreshed.accessToken,
      }));
    }
    return okAsync({ type: 'accessToken' as const, value: session.accessToken });
  }
  return errAsync(new UnauthenticatedError());
}

/**
 * Look up stored credentials using project→global precedence.
 * Handles OAuth refresh for both project and global sessions.
 * Returns null (via errAsync(UnauthenticatedError)) if nothing is stored.
 */
function resolveFromStoredSession(
  projectRoot: string | null
): ResultAsync<ResolvedCredential, CliError> {
  // Project scope first
  if (projectRoot) {
    const projectSession = readProjectSession(projectRoot);
    if (projectSession) {
      return resolveSessionWithRefresh(projectSession);
    }
  }
  // Global scope
  const session = readSession();
  if (session) {
    return resolveSessionWithRefresh(session);
  }
  return errAsync(new UnauthenticatedError());
}

export function resolveCredential(
  opts: ResolveOptions = {}
): ResultAsync<ResolvedCredential, CliError> {
  // 1) Explicit flag
  if (opts.apiKey) {
    return okAsync({ type: 'apiKey' as const, value: opts.apiKey });
  }
  if (opts.token) {
    return okAsync({ type: 'accessToken' as const, value: opts.token });
  }

  // 2) Env var
  if (process.env.LINEAR_API_KEY) {
    return okAsync({ type: 'apiKey' as const, value: process.env.LINEAR_API_KEY });
  }
  if (process.env.LINEAR_ACCESS_TOKEN) {
    return okAsync({ type: 'accessToken' as const, value: process.env.LINEAR_ACCESS_TOKEN });
  }

  // 3) Project-scoped session, then 4) global session (with OAuth refresh)
  const projectRoot = findProjectRoot(process.cwd());
  const stored = resolveFromStoredSession(projectRoot);

  // If a stored session was found (including after refresh), return it.
  // We use orElse to continue to the interactive fallback only on UnauthenticatedError.
  return stored.orElse((e) => {
    if (!(e instanceof UnauthenticatedError)) {
      return errAsync(e);
    }

    // 5) Interactive fallback if TTY
    if (opts.allowInteractive !== false && process.stdout.isTTY && process.stdin.isTTY) {
      return ResultAsync.fromPromise(
        runLoginFlow().then(() => {
          // Re-resolve projectRoot AFTER login: login may have created .linear/ dir
          const freshProjectRoot = findProjectRoot(process.cwd());
          const credential = resolveFromStoredSession(freshProjectRoot);
          return credential.match(
            (c) => c,
            () => {
              throw new UnauthenticatedError();
            }
          );
        }),
        (e) => (e instanceof UnauthenticatedError ? e : new UnauthenticatedError())
      );
    }

    // 6) Non-TTY: return err
    return errAsync(new UnauthenticatedError());
  });
}
