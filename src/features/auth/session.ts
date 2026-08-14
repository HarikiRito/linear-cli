export interface ApiKeySession {
  apiKey: string;
}

export interface OAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  /** ms epoch of the last token rotation (keepalive interval anchor). */
  lastRefreshAt?: number;
}

export type Session = ApiKeySession | OAuthSession;

export function isOAuthSession(session: Session): session is OAuthSession {
  return 'accessToken' in session;
}

export function isApiKeySession(session: Session): session is ApiKeySession {
  return 'apiKey' in session;
}
