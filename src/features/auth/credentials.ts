import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getGlobalConfigDir } from '../../lib/scope.js';
import type { Session } from './session.js';

/** Workspace-keyed credential store: ~/.config/.linear/credentials.json */
export interface CredentialsStore {
  workspaces: Record<string, Session>;
}

export function getCredentialsPath(): string {
  return path.join(getGlobalConfigDir(), 'credentials.json');
}

function isCredentialsStore(value: unknown): value is CredentialsStore {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { workspaces?: unknown };
  if (
    typeof candidate.workspaces !== 'object' ||
    candidate.workspaces === null ||
    Array.isArray(candidate.workspaces)
  ) {
    return false;
  }
  return true;
}

/** Tolerate missing or malformed store; never throws. */
export async function readCredentialsStore(): Promise<CredentialsStore> {
  try {
    const parsed: unknown = JSON.parse(await readFile(getCredentialsPath(), 'utf-8'));
    if (isCredentialsStore(parsed)) return parsed;
    return { workspaces: {} };
  } catch {
    return { workspaces: {} };
  }
}

export async function writeCredentialsStore(store: CredentialsStore): Promise<void> {
  const p = getCredentialsPath();
  await mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  await writeFile(p, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
}

export async function readWorkspaceCredential(workspaceId: string): Promise<Session | null> {
  const store = await readCredentialsStore();
  return store.workspaces[workspaceId] ?? null;
}

export async function writeWorkspaceCredential(
  workspaceId: string,
  session: Session
): Promise<void> {
  const store = await readCredentialsStore();
  store.workspaces[workspaceId] = session;
  await writeCredentialsStore(store);
}

/** True if the workspace credential existed and was deleted; false if absent. */
export async function deleteWorkspaceCredential(workspaceId: string): Promise<boolean> {
  const store = await readCredentialsStore();
  if (!(workspaceId in store.workspaces)) return false;
  delete store.workspaces[workspaceId];
  await writeCredentialsStore(store);
  return true;
}

export async function listWorkspaceCredentials(): Promise<Record<string, Session>> {
  return (await readCredentialsStore()).workspaces;
}

export async function listWorkspaceIds(): Promise<string[]> {
  return Object.keys((await readCredentialsStore()).workspaces);
}
