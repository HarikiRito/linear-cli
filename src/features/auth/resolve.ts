import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { type CliError, UnauthenticatedError } from '../../lib/errors.js';
import { runLoginFlow } from './login.js';
import { refreshAccessToken } from './oauth.js';
import { isApiKeySession, isOAuthSession, readSession } from './session.js';

export interface ResolvedCredential {
  type: 'apiKey' | 'accessToken';
  value: string;
}

export interface ResolveOptions {
  apiKey?: string;
  token?: string;
  allowInteractive?: boolean;
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

  // 3) Session file
  const session = readSession();
  if (session) {
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
  }

  // 4) Interactive fallback if TTY
  if (opts.allowInteractive !== false && process.stdout.isTTY && process.stdin.isTTY) {
    return ResultAsync.fromPromise(
      runLoginFlow().then(() => {
        const s = readSession();
        if (!s) throw new UnauthenticatedError();
        if (isApiKeySession(s)) return { type: 'apiKey' as const, value: s.apiKey };
        if (isOAuthSession(s)) return { type: 'accessToken' as const, value: s.accessToken };
        throw new UnauthenticatedError();
      }),
      (e) => (e instanceof UnauthenticatedError ? e : new UnauthenticatedError())
    );
  }

  // 5) Non-TTY: return err
  return errAsync(new UnauthenticatedError());
}
