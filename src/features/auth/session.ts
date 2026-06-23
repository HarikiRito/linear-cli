import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { err, ok, type Result } from 'neverthrow';

export interface ApiKeySession {
  apiKey: string;
}

export interface OAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export type Session = ApiKeySession | OAuthSession;

export function getSessionPath(): string {
  return path.join(os.homedir(), '.config', 'linear-cli', 'auth.json');
}

export function readSession(): Session | null {
  const sessionPath = getSessionPath();
  try {
    const data = fs.readFileSync(sessionPath, 'utf-8');
    return JSON.parse(data) as Session;
  } catch {
    return null;
  }
}

export function writeSession(session: Session): Result<void, Error> {
  const sessionPath = getSessionPath();
  const dir = path.dirname(sessionPath);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), { encoding: 'utf-8', mode: 0o600 });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export function deleteSession(): Result<void, Error> {
  const sessionPath = getSessionPath();
  try {
    fs.unlinkSync(sessionPath);
    return ok(undefined);
  } catch {
    return ok(undefined); // Ignore if file doesn't exist
  }
}

export function isOAuthSession(session: Session): session is OAuthSession {
  return 'accessToken' in session;
}

export function isApiKeySession(session: Session): session is ApiKeySession {
  return 'apiKey' in session;
}
