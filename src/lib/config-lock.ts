import { constants, writeSync } from 'node:fs';
import { type FileHandle, mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { getGlobalConfigDir } from './scope.js';

/**
 * Bounded exclusive file lock for config-store mutations. Serializes
 * read-modify-write cycles on the shared multi-key stores (credentials.json,
 * projects.json) across processes — e.g. `linear login` and a cron keepalive
 * run can no longer last-writer-wins each other's workspace entry.
 *
 * Path: getGlobalConfigDir()/.store.lock. Acquire via O_EXCL creat (atomic);
 * the lock file body records the owner PID + acquire timestamp. Retry with
 * backoff up to RETRY_TIMEOUT_MS. A lock is stale (reclaimable) when the owner
 * PID is no longer alive (process.kill(pid, 0) throws ESRCH/EPERM) or the
 * record is older than STALE_MS. Release unlinks only while still owned (PID
 * match), so a reclaimed lock is never clobbered.
 *
 * NOT reentrant — callers must wrap only the outermost read-modify-write
 * mutator, never the inner raw writers.
 */

const LOCK_NAME = '.store.lock';
const STALE_MS = 30_000;
const RETRY_DELAY_MS = 50;
const RETRY_TIMEOUT_MS = 3_000;

function lockPath(): string {
  return path.join(getGlobalConfigDir(), LOCK_NAME);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True if a PID belongs to a live process (kill(pid, 0) probe). */
function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false; // ESRCH (gone) / EPERM (foreign but alive — treat as gone)
  }
}

/** Stale = malformed record, aged past STALE_MS, or dead owner. */
async function isStaleLock(p: string): Promise<boolean> {
  let content: string;
  try {
    content = await readFile(p, 'utf-8');
  } catch {
    return true; // unreadable or already gone — nothing held
  }
  const [pidStr, tsStr] = content.split(':');
  const pid = Number(pidStr);
  const ts = Number(tsStr);
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(ts)) return true;
  if (Date.now() - ts > STALE_MS) return true;
  return !isPidAlive(pid);
}

/**
 * Atomic O_EXCL create + owner record. Returns false when already held. The
 * record is written synchronously immediately after the open resolves — no
 * await in between — so no concurrent reader can ever observe the lock file
 * in an empty, stealable state.
 */
async function tryAcquire(p: string): Promise<boolean> {
  let fd: FileHandle;
  try {
    fd = await open(p, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e; // real fs error (e.g. EACCES) — surface, don't spin
  }
  try {
    writeSync(fd.fd, `${process.pid}:${Date.now()}`);
  } finally {
    await fd.close();
  }
  return true;
}

/** Unlink only while still owned — a reclaimed lock is left alone. */
async function releaseLock(p: string): Promise<void> {
  try {
    const pid = Number((await readFile(p, 'utf-8')).split(':')[0]);
    if (pid !== process.pid) return;
    await unlink(p);
  } catch {
    // absent or unreadable — nothing to release
  }
}

export async function withConfigLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const p = lockPath();
  await mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + RETRY_TIMEOUT_MS;
  for (;;) {
    if (await tryAcquire(p)) break;
    if (await isStaleLock(p)) {
      await unlink(p).catch(() => undefined);
      continue; // retry immediately on the reclaimed lock
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out acquiring config-store lock (${p})`);
    }
    await sleep(RETRY_DELAY_MS);
  }
  try {
    return await fn();
  } finally {
    await releaseLock(p);
  }
}
