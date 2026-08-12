import fs from 'node:fs';
import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { KEEPALIVE_INTERVAL_MS, KEEPALIVE_LOCK_FILE } from '../../lib/config.js';
import { toError } from '../../lib/errors.js';
import { getProjectLinearDir } from '../../lib/scope.js';
import { refreshAccessToken } from '../auth/oauth.js';
import {
  getProjectSessionPath,
  isOAuthSession,
  type OAuthSession,
  readProjectSession,
  writeProjectSession,
} from '../auth/session.js';
import { listProjects, unregisterProject } from './registry.js';
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

function acquireLock(projectRoot: string): boolean {
  const lockPath = path.join(getProjectLinearDir(projectRoot), KEEPALIVE_LOCK_FILE);
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

function releaseLock(projectRoot: string): void {
  const lockPath = path.join(getProjectLinearDir(projectRoot), KEEPALIVE_LOCK_FILE);
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
 * Rotate one registered project's OAuth refresh token if due. Never throws;
 * all per-project outcomes are folded into `summary`.
 */
export async function rotateProject(
  projectRoot: string,
  _opts: KeepaliveCycleOptions,
  summary: RotationSummary
): Promise<void> {
  const authPath = getProjectSessionPath(projectRoot);
  if (!fs.existsSync(authPath)) {
    // Session gone — drop from registry.
    void unregisterProject(projectRoot);
    summary.pruned++;
    appendLog(`prune ${projectRoot}: no auth.json`);
    return;
  }

  const session = readProjectSession(projectRoot);
  if (!session || !isOAuthSession(session)) {
    summary.skipped++; // API key / unreadable — nothing to rotate
    return;
  }

  const last = session.lastRefreshAt ?? 0;
  if (Date.now() - last < KEEPALIVE_INTERVAL_MS) {
    summary.skipped++;
    return;
  }

  if (!acquireLock(projectRoot)) {
    summary.skipped++; // another run holds the lock
    return;
  }

  try {
    // Re-read after locking (TOCTOU) and re-check the interval.
    const fresh = readProjectSession(projectRoot);
    if (!fresh || !isOAuthSession(fresh)) return;
    if (Date.now() - (fresh.lastRefreshAt ?? 0) < KEEPALIVE_INTERVAL_MS) {
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
      const writeResult = writeProjectSession(projectRoot, updated);
      if (writeResult.isErr()) {
        summary.failed++;
        appendLog(`error ${projectRoot}: persist failed: ${writeResult.error.message}`);
      } else {
        summary.rotated++;
        appendLog(`rotated ${projectRoot}`);
      }
    } else {
      summary.failed++;
      const message = refreshResult.error.message;
      appendLog(`error ${projectRoot}: refresh failed: ${message}`);
      if (message.includes('invalid_grant')) {
        appendLog(`session ${projectRoot} is dead (invalid_grant) — needs interactive re-auth`);
      }
    }
  } finally {
    releaseLock(projectRoot);
  }
}

/** Run one keepalive pass over every registered project. */
export async function runKeepaliveCycle(
  opts: KeepaliveCycleOptions = {}
): Promise<Result<RotationSummary, Error>> {
  const summary: RotationSummary = { checked: 0, rotated: 0, skipped: 0, failed: 0, pruned: 0 };
  const listResult = listProjects();
  if (listResult.isErr()) return err(listResult.error);
  for (const project of listResult.value) {
    summary.checked++;
    await rotateProject(project.root, opts, summary);
  }
  return ok(summary);
}
