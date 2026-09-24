import { ResultAsync } from 'neverthrow';
import { buildLinearClient } from '../../lib/client/index.js';
import { mapLinearError, toError } from '../../lib/errors.js';
import { type ResolvedCredential, resolveSessionWithRefresh } from '../auth/resolve.js';
import { isApiKeySession, type Session } from '../auth/session.js';

export type WorkspaceAuthState = 'valid' | 'expired-refreshable' | 'invalid' | 'unreachable';

export interface WorkspaceInfo {
  id: string;
  name: string;
  urlKey: string;
  state: WorkspaceAuthState;
  /** Usable credential, when one is available. Absent only for a confirmed-dead 'invalid' session. */
  credential?: ResolvedCredential;
}

export function sessionToCredential(session: Session): ResolvedCredential {
  if (isApiKeySession(session)) return { type: 'apiKey', value: session.apiKey };
  return { type: 'accessToken', value: session.accessToken };
}

/**
 * Resolve a stored workspace's live auth status. For OAuth sessions this
 * refreshes (and writes back) an expired token via the same
 * resolveSessionWithRefresh path every other command uses — see H-642 — rather
 * than probing the raw, possibly-stale stored access token.
 *
 * States:
 * - 'valid': usable now, no refresh was needed.
 * - 'expired-refreshable': was expired but the refresh (and org probe) succeeded.
 * - 'invalid': refresh (or the apiKey org probe) failed with a genuine auth
 *   error (invalid_grant/401) — dead, needs `linear login`.
 * - 'unreachable': network/timeout/5xx — possibly still usable; never forces re-auth.
 */
export async function resolveWorkspaceStatus(id: string, session: Session): Promise<WorkspaceInfo> {
  if (isApiKeySession(session)) {
    const credential = sessionToCredential(session);
    const client = buildLinearClient(credential);
    const orgResult = await ResultAsync.fromPromise(client.organization, toError);
    if (orgResult.isOk()) {
      return {
        id,
        name: orgResult.value.name,
        urlKey: orgResult.value.urlKey,
        state: 'valid',
        credential,
      };
    }
    const isNetwork = mapLinearError(orgResult.error).kind === 'NetworkError';
    return {
      id,
      name: id,
      urlKey: '',
      state: isNetwork ? 'unreachable' : 'invalid',
      ...(isNetwork ? { credential } : {}),
    };
  }

  const wasExpired = session.expiresAt != null && Date.now() >= session.expiresAt - 60_000;
  const refreshResult = await resolveSessionWithRefresh(session, id);
  if (refreshResult.isErr()) {
    const isNetwork = refreshResult.error.kind === 'NetworkError';
    return {
      id,
      name: id,
      urlKey: '',
      state: isNetwork ? 'unreachable' : 'invalid',
      ...(isNetwork ? { credential: sessionToCredential(session) } : {}),
    };
  }

  const credential = refreshResult.value;
  const client = buildLinearClient(credential);
  const orgResult = await ResultAsync.fromPromise(client.organization, toError);
  if (orgResult.isErr()) {
    return { id, name: id, urlKey: '', state: 'unreachable', credential };
  }
  return {
    id,
    name: orgResult.value.name,
    urlKey: orgResult.value.urlKey,
    state: wasExpired ? 'expired-refreshable' : 'valid',
    credential,
  };
}
