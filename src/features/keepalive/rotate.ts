import fs from 'node:fs';
import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import {
  KEEPALIVE_BACKOFF_MS,
  KEEPALIVE_INTERVAL_MS,
  KEEPALIVE_LOCK_FILE,
} from '../../lib/config.js';
import { toError } from '../../lib/errors.js';
import { getGlobalConfigDir, getProjectLinearDir } from '../../lib/scope.js';
import { refreshAccessToken } from '../auth/oauth.js';
import {
  getProjectSessionPath,
  getSessionPath,
  isOAuthSession,
  type OAuthSession,
  readProjectSession,
  readSession,
  type Session,
  writeProjectSession,
  writeSession,
} from '../auth/session.js';
import {
  getEntry,
  getGlobalEntryRoot,
  listProjects,
  type RegisteredProject,
  unregisterProject,
  updateEntry,
} from './registry.js';
import { getLogPath } from './scheduler/index.js';

export interface RotationSummary {
  checked: number;
  rotated: number;
  skipped: number;
  failed: number;
  pruned: number;
}

export interface KeepaliveCycleOptions {
  quiet?: boolean;
}

/** A lock older than this (or with a dead PID) is considered stale. */
const LOCK_STALE_MS = 30 * 60 * 1000;

function appendLog(line: string): void {
  void Result.fromThrowable(() => {
    const p = getLogPath();
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${line}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }, toError)();
}

/** True if the holder is gone (dead PID) or the lock has aged past LOCK_STALE_MS. */
function isStaleLock(lockPath: string): boolean {
  const content = Result.fromThrowable(
    () => fs.readFileSync(lockPath, 'utf-8'),
    () => undefined
  )().unwrapOr('');
  const [pidStr, tsStr] = content.split(':');
  const pid = Number(pidStr);
  const ts = Number(tsStr);
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(ts)) return true; // malformed
  if (Date.now() - ts > LOCK_STALE_MS) return true;
  try {
    process.kill(pid, 0);
    return false; // holder alive
  } catch {
    return true; // holder dead
  }
}

function acquireLock(lockPath: string): boolean {
  const openLock = (): boolean => {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try {
        fs.writeSync(fd, `${process.pid}:${Date.now()}`);
      } finally {
        fs.closeSync(fd);
      }
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') return false;
      // Locked — maybe by a dead/stale holder, retry once after clearing.
      if (isStaleLock(lockPath)) {
        void Result.fromThrowable(
          () => fs.unlinkSync(lockPath),
          () => undefined
        )();
        return openLock();
      }
      return false;
    }
  };
  return openLock();
}

function releaseLock(lockPath: string): void {
  // Only release if we still own the lock — a stale lock may have been
  // reclaimed (and rewritten) by another process while we were rotating.
  const holderPid = Result.fromThrowable(
    () => Number(fs.readFileSync(lockPath, 'utf-8').split(':')[0] ?? NaN),
    () => NaN
  )().unwrapOr(NaN);
  if (holderPid !== process.pid) return;
  void Result.fromThrowable(
    () => fs.unlinkSync(lockPath),
    () => undefined
  )();
}

// --- entry-aware helpers: project entries use <root>/.linear, global uses ~/.config/.linear ---

function entrySessionPath(entry: RegisteredProject): string {
  return entry.scope === 'global' ? getSessionPath() : getProjectSessionPath(entry.root);
}

function entryLockPath(entry: RegisteredProject): string {
  const dir = entry.scope === 'global' ? getGlobalConfigDir() : getProjectLinearDir(entry.root);
  return path.join(dir, KEEPALIVE_LOCK_FILE);
}

function entryReadSession(entry: RegisteredProject): Session | null {
  return entry.scope === 'global' ? readSession() : readProjectSession(entry.root);
}

function entryWriteSession(entry: RegisteredProject, session: OAuthSession): Result<void, Error> {
  return entry.scope === 'global'
    ? writeSession(session)
    : writeProjectSession(entry.root, session);
}

function entryUnregister(entry: RegisteredProject): Result<void, Error> {
  return unregisterProject(entry.scope === 'global' ? getGlobalEntryRoot() : entry.root);
}

function entryUpdateBackoff(
  entry: RegisteredProject,
  patch: Partial<RegisteredProject>
): Result<void, Error> {
  return updateEntry(entry.scope === 'global' ? getGlobalEntryRoot() : entry.root, patch);
}

function entryGetBackoff(entry: RegisteredProject): { tier?: number; nextAttemptAt?: number } {
  const e = getEntry(entry.scope === 'global' ? getGlobalEntryRoot() : entry.root);
  return { tier: e?.invalidGrantTier, nextAttemptAt: e?.invalidGrantNextAttemptAt };
}

/**
 * Best-effort clear of invalid_grant backoff. Used when a skip path still
 * indicates a healthy session (e.g. another process rotated it while we
 * waited on the lock) — the backoff no longer applies.
 */
function clearBackoffIfSet(entry: RegisteredProject, tier: number | undefined): void {
  if (tier === undefined) return;
  void entryUpdateBackoff(entry, {
    invalidGrantTier: undefined,
    invalidGrantNextAttemptAt: undefined,
  });
}

/**
 * Rotate one registered session's OAuth refresh token if due. Never throws;
 * all per-entry outcomes are folded into `summary`.
 */
export async function rotateEntry(
  entry: RegisteredProject,
  _opts: KeepaliveCycleOptions,
  summary: RotationSummary
): Promise<void> {
  const authPath = entrySessionPath(entry);
  if (!fs.existsSync(authPath)) {
    // Session gone — drop from registry.
    void entryUnregister(entry);
    summary.pruned++;
    appendLog(`prune ${entry.scope ?? 'project'}:${entry.root}: no auth.json`);
    return;
  }

  // invalid_grant backoff: skip silently until the backoff window expires.
  const backoff = entryGetBackoff(entry);
  if (backoff.nextAttemptAt !== undefined && backoff.nextAttemptAt > Date.now()) {
    summary.skipped++;
    return;
  }

  const session = entryReadSession(entry);
  if (!session || !isOAuthSession(session)) {
    summary.skipped++; // API key / unreadable — nothing to rotate
    return;
  }

  const last = session.lastRefreshAt ?? 0;
  if (Date.now() - last < KEEPALIVE_INTERVAL_MS) {
    summary.skipped++;
    return;
  }

  const lockPath = entryLockPath(entry);
  if (!acquireLock(lockPath)) {
    summary.skipped++; // another run holds the lock
    return;
  }

  try {
    // Re-read after locking (TOCTOU) and re-check the interval.
    const fresh = entryReadSession(entry);
    if (!fresh || !isOAuthSession(fresh)) {
      clearBackoffIfSet(entry, backoff.tier);
      return;
    }
    if (Date.now() - (fresh.lastRefreshAt ?? 0) < KEEPALIVE_INTERVAL_MS) {
      clearBackoffIfSet(entry, backoff.tier); // rotated elsewhere — backoff moot
      summary.skipped++;
      return;
    }

    const refreshResult = await refreshAccessToken(fresh.refreshToken);
    if (refreshResult.isOk()) {
      const updated: OAuthSession = {
        accessToken: refreshResult.value.accessToken,
        refreshToken: refreshResult.value.refreshToken,
        expiresAt: refreshResult.value.expiresAt,
        lastRefreshAt: Date.now(),
      };
      const writeResult = entryWriteSession(entry, updated);
      if (writeResult.isErr()) {
        summary.failed++;
        appendLog(`error ${entry.root}: persist failed: ${writeResult.error.message}`);
      } else {
        summary.rotated++;
        // Refresh worked — clear any accumulated invalid_grant backoff.
        if (backoff.tier !== undefined) {
          void entryUpdateBackoff(entry, {
            invalidGrantTier: undefined,
            invalidGrantNextAttemptAt: undefined,
          });
        }
        appendLog(`rotated ${entry.root}`);
      }
    } else {
      summary.failed++;
      const message = refreshResult.error.message;
      appendLog(`error ${entry.root}: refresh failed: ${message}`);
      if (message.includes('invalid_grant')) {
        const tier = (backoff.tier ?? 0) + 1;
        const delay = KEEPALIVE_BACKOFF_MS[Math.min(tier - 1, KEEPALIVE_BACKOFF_MS.length - 1)];
        const nextAttemptAt = Date.now() + delay;
        void entryUpdateBackoff(entry, {
          invalidGrantTier: tier,
          invalidGrantNextAttemptAt: nextAttemptAt,
        });
        appendLog(
          `invalid_grant ${entry.root}: backing off for ${Math.round(delay / 60_000)}min (tier ${tier}) — needs interactive re-auth`
        );
      }
    }
  } finally {
    releaseLock(lockPath);
  }
}

/** Run one keepalive pass over every registered entry. */
export async function runKeepaliveCycle(
  opts: KeepaliveCycleOptions = {}
): Promise<Result<RotationSummary, Error>> {
  const summary: RotationSummary = { checked: 0, rotated: 0, skipped: 0, failed: 0, pruned: 0 };
  const listResult = listProjects();
  if (listResult.isErr()) return err(listResult.error);
  for (const project of listResult.value) {
    summary.checked++;
    await rotateEntry(project, opts, summary);
  }
  return ok(summary);
}
