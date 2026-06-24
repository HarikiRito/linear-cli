import fs from 'node:fs';
import path from 'node:path';
import { err, ok, type Result } from 'neverthrow';
import { getGlobalConfigDir, getProjectLinearDir } from '../../lib/scope.js';

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
  return path.join(getGlobalConfigDir(), 'auth.json');
}

export function getProjectSessionPath(projectRoot: string): string {
  return path.join(getProjectLinearDir(projectRoot), 'auth.json');
}

// --- private path-based helpers ---

function writeSessionToPath(p: string, session: Session): Result<void, Error> {
  const dir = path.dirname(p);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify(session, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

function readSessionFromPath(p: string): Session | null {
  try {
    const data = fs.readFileSync(p, 'utf-8');
    return JSON.parse(data) as Session;
  } catch {
    return null;
  }
}

function deleteSessionAtPath(p: string): Result<void, Error> {
  try {
    fs.unlinkSync(p);
    return ok(undefined);
  } catch {
    return ok(undefined); // Ignore if file doesn't exist
  }
}

// --- public API ---

export function readSession(): Session | null {
  return readSessionFromPath(getSessionPath());
}

export function writeSession(session: Session): Result<void, Error> {
  return writeSessionToPath(getSessionPath(), session);
}

export function deleteSession(): Result<void, Error> {
  return deleteSessionAtPath(getSessionPath());
}

export function isOAuthSession(session: Session): session is OAuthSession {
  return 'accessToken' in session;
}

export function isApiKeySession(session: Session): session is ApiKeySession {
  return 'apiKey' in session;
}

export function readProjectSession(projectRoot: string): Session | null {
  return readSessionFromPath(getProjectSessionPath(projectRoot));
}

export function writeProjectSession(projectRoot: string, session: Session): Result<void, Error> {
  return writeSessionToPath(getProjectSessionPath(projectRoot), session);
}

export function deleteProjectSession(projectRoot: string): Result<void, Error> {
  return deleteSessionAtPath(getProjectSessionPath(projectRoot));
}
