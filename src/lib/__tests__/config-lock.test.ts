import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withConfigLock } from '../config-lock.js';
import * as scopeMod from '../scope.js';

const LOCK_NAME = '.store.lock';

function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', '']);
  expect(child.status).toBe(0);
  return child.pid ?? 0;
}

describe('withConfigLock (config-store lock)', () => {
  let tmpHome: string;
  let lockPath: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-lock-home-'));
    lockPath = path.join(tmpHome, LOCK_NAME);
    vi.spyOn(scopeMod, 'getGlobalConfigDir').mockReturnValue(tmpHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('two concurrent calls execute serially (second waits for first)', async () => {
    const order: string[] = [];
    // Wait until the first call is actually holding the lock before starting
    // the second — otherwise the test races on which call wins acquisition.
    let firstStarted!: () => void;
    const started = new Promise<void>((r) => (firstStarted = r));
    const first = withConfigLock(async () => {
      order.push('first-start');
      firstStarted();
      await new Promise((r) => setTimeout(r, 120));
      order.push('first-end');
    });
    await started;

    const second = withConfigLock(() => {
      order.push('second-start');
    });

    await Promise.all([first, second]);

    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('reclaims a stale lock left by a dead PID', async () => {
    fs.writeFileSync(lockPath, `${deadPid()}:${Date.now()}`, 'utf-8');

    await withConfigLock(() => undefined);

    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('reclaims a lock whose owner is alive but the record is stale by age', async () => {
    // Live PID (this process) but a 60s-old timestamp > 30s STALE_MS.
    fs.writeFileSync(lockPath, `${process.pid}:${Date.now() - 60_000}`, 'utf-8');

    await withConfigLock(() => undefined);

    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('releases the lock even when the inner function throws', async () => {
    await expect(
      withConfigLock(() => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
