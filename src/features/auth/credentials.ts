import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Result, ResultAsync } from 'neverthrow';
import { withConfigLock } from '../../lib/config-lock.js';
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
  const content = await ResultAsync.fromPromise(
    readFile(getCredentialsPath(), 'utf-8'),
    () => undefined
  ).unwrapOr('');
  const parsed = Result.fromThrowable(
    () => JSON.parse(content) as unknown,
    () => undefined
  )().unwrapOr(null);
  return parsed !== null && isCredentialsStore(parsed) ? parsed : { workspaces: {} };
}

/** Raw full-store replace — no lock (callers hold it via withConfigLock). */
async function writeCredentialsStoreRaw(store: CredentialsStore): Promise<void> {
  const p = getCredentialsPath();
  await mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  await writeFile(p, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
}

/** Full-store replace, serialized against other store mutations. */
export function writeCredentialsStore(store: CredentialsStore): Promise<void> {
  return withConfigLock(() => writeCredentialsStoreRaw(store));
}

export async function readWorkspaceCredential(workspaceId: string): Promise<Session | null> {
  const store = await readCredentialsStore();
  return store.workspaces[workspaceId] ?? null;
}

/** Read-modify-write on the shared store, serialized via the config lock. */
export function writeWorkspaceCredential(workspaceId: string, session: Session): Promise<void> {
  return withConfigLock(async () => {
    const store = await readCredentialsStore();
    store.workspaces[workspaceId] = session;
    await writeCredentialsStoreRaw(store);
  });
}

/** True if the workspace credential existed and was deleted; false if absent. */
export function deleteWorkspaceCredential(workspaceId: string): Promise<boolean> {
  return withConfigLock(async () => {
    const store = await readCredentialsStore();
    if (!(workspaceId in store.workspaces)) return false;
    delete store.workspaces[workspaceId];
    await writeCredentialsStoreRaw(store);
    return true;
  });
}

export async function listWorkspaceCredentials(): Promise<Record<string, Session>> {
  return (await readCredentialsStore()).workspaces;
}

export async function listWorkspaceIds(): Promise<string[]> {
  return Object.keys((await readCredentialsStore()).workspaces);
}
