import fs from 'node:fs';
import path from 'node:path';
import { ok, Result, ResultAsync } from 'neverthrow';
import {
  getWorkspaceLockPath,
  KEEPALIVE_BACKOFF_MS,
  KEEPALIVE_INTERVAL_MS,
} from '../../lib/config.js';
import { toError } from '../../lib/errors.js';
import {
  listWorkspaceIds,
  readWorkspaceCredential,
  writeWorkspaceCredential,
} from '../auth/credentials.js';
import { refreshAccessToken } from '../auth/oauth.js';
import { isOAuthSession, type OAuthSession } from '../auth/session.js';
import { getLogPath } from './scheduler/index.js';
import {
  clearWorkspaceBackoff,
  deleteWorkspaceState,
  readWorkspaceState,
  updateWorkspaceState,
} from './state.js';

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

/**
 * Fold a best-effort keepalive-state write into the summary; never rejects.
 * Returns true on success; on failure counts it in `summary.failed` and logs.
 */
async function foldStateWrite(
  op: () => Promise<void>,
  summary: RotationSummary,
  workspaceId: string,
  label: string
): Promise<boolean> {
  const result = await ResultAsync.fromPromise(op(), toError);
  if (result.isOk()) return true;
  summary.failed++;
  appendLog(`error ${workspaceId}: ${label}: ${result.error.message}`);
  return false;
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
  return Result.fromThrowable(
    () => process.kill(pid, 0),
    () => undefined // holder dead (ESRCH)
  )().isErr();
}

function acquireLock(lockPath: string): boolean {
  const openLock = (): boolean => {
    const opened = Result.fromThrowable(
      () => fs.openSync(lockPath, 'wx'),
      (e) => e as NodeJS.ErrnoException
    )();
    if (opened.isOk()) {
      const fd = opened.value;
      try {
        fs.writeSync(fd, `${process.pid}:${Date.now()}`);
      } finally {
        fs.closeSync(fd);
      }
      return true;
    }
    if (opened.error.code !== 'EEXIST') return false;
    // Locked — maybe by a dead/stale holder, retry once after clearing.
    if (isStaleLock(lockPath)) {
      void Result.fromThrowable(
        () => fs.unlinkSync(lockPath),
        () => undefined
      )();
      return openLock();
    }
    return false;
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

/**
 * Rotate one workspace's OAuth refresh token if due. Never throws; every
 * outcome is folded into `summary`. Rotation only touches the credential store
 * and keepalive state — it never mutates directory linkage (registry).
 */
async function rotateWorkspace(workspaceId: string, summary: RotationSummary): Promise<void> {
  const session = await readWorkspaceCredential(workspaceId);
  if (!session) {
    // Credential gone (raced) — drop any lingering backoff state.
    if (
      !(await foldStateWrite(
        () => deleteWorkspaceState(workspaceId),
        summary,
        workspaceId,
        'prune state'
      ))
    ) {
      return;
    }
    summary.pruned++;
    appendLog(`prune ${workspaceId}: no credential`);
    return;
  }

  if (!isOAuthSession(session)) {
    summary.skipped++; // API key — nothing to rotate
    return;
  }

  // invalid_grant backoff: skip silently until the backoff window expires.
  const backoff = await readWorkspaceState(workspaceId);
  if (
    backoff.invalidGrantNextAttemptAt !== undefined &&
    backoff.invalidGrantNextAttemptAt > Date.now()
  ) {
    summary.skipped++;
    return;
  }

  const last = session.lastRefreshAt ?? 0;
  if (Date.now() - last < KEEPALIVE_INTERVAL_MS) {
    summary.skipped++;
    return;
  }

  const lockPath = getWorkspaceLockPath(workspaceId);
  const mkdirResult = Result.fromThrowable(
    () => fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 }),
    toError
  )();
  if (mkdirResult.isErr()) {
    summary.failed++;
    appendLog(`error ${workspaceId}: lock dir: ${mkdirResult.error.message}`);
    return;
  }
  if (!acquireLock(lockPath)) {
    summary.skipped++; // another run holds the lock
    return;
  }

  try {
    // Re-read after locking (TOCTOU) and re-check the interval.
    const fresh = await readWorkspaceCredential(workspaceId);
    if (!fresh || !isOAuthSession(fresh)) {
      if (backoff.invalidGrantTier !== undefined) {
        await foldStateWrite(
          () => clearWorkspaceBackoff(workspaceId),
          summary,
          workspaceId,
          'clear backoff'
        );
      }
      return;
    }
    if (Date.now() - (fresh.lastRefreshAt ?? 0) < KEEPALIVE_INTERVAL_MS) {
      if (backoff.invalidGrantTier !== undefined) {
        // rotated elsewhere — backoff moot
        await foldStateWrite(
          () => clearWorkspaceBackoff(workspaceId),
          summary,
          workspaceId,
          'clear backoff'
        );
      }
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
      const writeResult = await ResultAsync.fromPromise(
        writeWorkspaceCredential(workspaceId, updated),
        toError
      );
      if (writeResult.isErr()) {
        summary.failed++;
        appendLog(`error ${workspaceId}: persist failed: ${writeResult.error.message}`);
      } else {
        summary.rotated++;
        // Refresh worked — clear any accumulated invalid_grant backoff.
        await foldStateWrite(
          () => clearWorkspaceBackoff(workspaceId),
          summary,
          workspaceId,
          'clear backoff'
        );
        appendLog(`rotated ${workspaceId}`);
      }
    } else {
      summary.failed++;
      const message = refreshResult.error.message;
      appendLog(`error ${workspaceId}: refresh failed: ${message}`);
      if (message.includes('invalid_grant')) {
        const tier = (backoff.invalidGrantTier ?? 0) + 1;
        const delay = KEEPALIVE_BACKOFF_MS[Math.min(tier - 1, KEEPALIVE_BACKOFF_MS.length - 1)];
        const nextAttemptAt = Date.now() + delay;
        const recorded = await foldStateWrite(
          () =>
            updateWorkspaceState(workspaceId, {
              invalidGrantTier: tier,
              invalidGrantNextAttemptAt: nextAttemptAt,
            }),
          summary,
          workspaceId,
          'backoff state'
        );
        if (recorded) {
          appendLog(
            `invalid_grant ${workspaceId}: backing off for ${Math.round(delay / 60_000)}min (tier ${tier}) — needs interactive re-auth`
          );
        }
      }
    }
  } finally {
    releaseLock(lockPath);
  }
}

/** Run one keepalive pass over every workspace in the credentials store. */
export async function runKeepaliveCycle(
  _opts: KeepaliveCycleOptions = {}
): Promise<Result<RotationSummary, Error>> {
  const summary: RotationSummary = { checked: 0, rotated: 0, skipped: 0, failed: 0, pruned: 0 };
  for (const workspaceId of await listWorkspaceIds()) {
    summary.checked++;
    await rotateWorkspace(workspaceId, summary);
  }
  return ok(summary);
}
