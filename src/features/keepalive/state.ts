import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Result, ResultAsync } from 'neverthrow';
import { getGlobalConfigDir } from '../../lib/scope.js';

/** Per-workspace invalid_grant backoff state (moved off the registry). */
export interface WorkspaceBackoffState {
  /** Backoff tier for invalid_grant (1-based; undefined = healthy). */
  invalidGrantTier?: number;
  /** ms-epoch before which rotation should be skipped due to invalid_grant backoff. */
  invalidGrantNextAttemptAt?: number;
}

export interface KeepaliveStateFile {
  workspaces: Record<string, WorkspaceBackoffState>;
}

export function getKeepaliveStatePath(): string {
  return path.join(getGlobalConfigDir(), 'keepalive-state.json');
}

function isKeepaliveStateFile(value: unknown): value is KeepaliveStateFile {
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

/** Tolerate missing or malformed state; never throws. */
export async function readKeepaliveState(): Promise<KeepaliveStateFile> {
  const content = await ResultAsync.fromPromise(
    readFile(getKeepaliveStatePath(), 'utf-8'),
    () => undefined
  ).unwrapOr('');
  const parsed = Result.fromThrowable(
    () => JSON.parse(content) as unknown,
    () => undefined
  )().unwrapOr(null);
  return parsed !== null && isKeepaliveStateFile(parsed) ? parsed : { workspaces: {} };
}

export async function writeKeepaliveState(state: KeepaliveStateFile): Promise<void> {
  const p = getKeepaliveStatePath();
  await mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  await writeFile(p, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
}

export async function readWorkspaceState(workspaceId: string): Promise<WorkspaceBackoffState> {
  const state = await readKeepaliveState();
  return state.workspaces[workspaceId] ?? {};
}

/** Re-read, merge the patch onto the workspace entry, and write back. */
export async function updateWorkspaceState(
  workspaceId: string,
  patch: Partial<WorkspaceBackoffState>
): Promise<void> {
  const state = await readKeepaliveState();
  state.workspaces[workspaceId] = {
    ...(state.workspaces[workspaceId] ?? {}),
    ...patch,
  };
  await writeKeepaliveState(state);
}

/** Drop backoff fields; removes the entry entirely when nothing remains. */
export async function clearWorkspaceBackoff(workspaceId: string): Promise<void> {
  const state = await readKeepaliveState();
  const existing = state.workspaces[workspaceId];
  if (!existing) return;
  delete existing.invalidGrantTier;
  delete existing.invalidGrantNextAttemptAt;
  if (Object.keys(existing).length === 0) delete state.workspaces[workspaceId];
  await writeKeepaliveState(state);
}

/** Remove the whole per-workspace entry (used when the credential is gone). */
export async function deleteWorkspaceState(workspaceId: string): Promise<void> {
  const state = await readKeepaliveState();
  if (!(workspaceId in state.workspaces)) return;
  delete state.workspaces[workspaceId];
  await writeKeepaliveState(state);
}
