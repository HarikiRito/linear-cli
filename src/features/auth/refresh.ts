import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { AuthError, type CliError, toError, UnauthenticatedError } from '../../lib/errors.js';
import { readWorkspaceCredential, writeWorkspaceCredential } from './credentials.js';
import { refreshAccessToken } from './oauth.js';
import { isApiKeySession, isOAuthSession, type Session } from './session.js';

export interface ResolvedCredential {
  type: 'apiKey' | 'accessToken';
  value: string;
}

/**
 * Resolve a single session to a credential, refreshing OAuth tokens when
 * expired. Rotated tokens are written back to the workspace credential the
 * session came from (no cross-writing).
 */
export function resolveSessionWithRefresh(
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
export function resolveWorkspaceCredential(
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
