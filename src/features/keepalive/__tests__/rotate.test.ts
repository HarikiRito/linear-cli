import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, NetworkError } from '../../../lib/errors.js';

// refreshAccessToken is the only network boundary — mock it entirely.
vi.mock('../../auth/oauth.js', () => ({
  startOAuthFlow: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

import * as scopeMod from '../../../lib/scope.js';
import { refreshAccessToken } from '../../auth/oauth.js';
import * as sessionMod from '../../auth/session.js';
import { type OAuthSession, readProjectSession, writeProjectSession } from '../../auth/session.js';
import { listProjects, registerProject } from '../registry.js';
import { type RotationSummary, runKeepaliveCycle } from '../rotate.js';

const mockRefresh = vi.mocked(refreshAccessToken);

function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', '']);
  expect(child.status).toBe(0);
  return child.pid ?? 0;
}

describe('keepalive rotation cycle', () => {
  let tmpHome: string;
  let projDir: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-rotate-home-'));
    projDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-rotate-proj-'));
    vi.spyOn(scopeMod, 'getGlobalConfigDir').mockReturnValue(tmpHome);
    mockRefresh.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(projDir, { recursive: true, force: true });
  });

  /** Write a due-by-default OAuth session and register the project. */
  function seedOAuthSession(
    overrides: Partial<Parameters<typeof writeProjectSession>[1]> = {}
  ): void {
    const session = {
      accessToken: 'old-at',
      refreshToken: 'old-rt',
      expiresAt: Date.now() + 3600_000,
      lastRefreshAt: Date.now() - 25 * 3600_000, // 25h old → due
      ...overrides,
    };
    expect(writeProjectSession(projDir, session).isOk()).toBe(true);
    expect(registerProject(projDir).isOk()).toBe(true);
  }

  async function runCycle(): Promise<RotationSummary> {
    const result = await runKeepaliveCycle();
    if (result.isErr()) throw result.error;
    return result.value;
  }

  it('skips rotation when last refresh is < 24h old (no network call)', async () => {
    seedOAuthSession({ lastRefreshAt: Date.now() });

    const summary = await runCycle();

    expect(summary).toMatchObject({ checked: 1, rotated: 0, skipped: 1, failed: 0, pruned: 0 });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('rotates when last refresh is >= 24h old and persists lastRefreshAt', async () => {
    const before = Date.now();
    mockRefresh.mockResolvedValue(
      ok({ accessToken: 'new-at', refreshToken: 'new-rt', expiresAt: before + 3600_000 })
    );
    seedOAuthSession();

    const summary = await runCycle();

    expect(summary).toMatchObject({ checked: 1, rotated: 1, skipped: 0, failed: 0 });
    expect(mockRefresh).toHaveBeenCalledWith('old-rt');
    const stored = readProjectSession(projDir);
    expect(stored).toMatchObject({ accessToken: 'new-at', refreshToken: 'new-rt' });
    expect((stored as { lastRefreshAt: number }).lastRefreshAt).toBeGreaterThanOrEqual(before);
    // lock released after rotation
    expect(fs.existsSync(path.join(projDir, '.linear', 'auth.lock'))).toBe(false);
  });

  it('treats a missing lastRefreshAt as 0 (due immediately)', async () => {
    mockRefresh.mockResolvedValue(
      ok({ accessToken: 'new-at', refreshToken: 'new-rt', expiresAt: Date.now() + 3600_000 })
    );
    seedOAuthSession({ lastRefreshAt: undefined });

    const summary = await runCycle();

    expect(summary.rotated).toBe(1);
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('prunes projects whose auth.json no longer exists', async () => {
    expect(registerProject(projDir).isOk()).toBe(true); // registered, no session file

    const summary = await runCycle();

    expect(summary).toMatchObject({ checked: 1, pruned: 1, rotated: 0 });
    expect(listProjects()._unsafeUnwrap()).toEqual([]);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('invalid_grant failure counts as failed, keeps the session, logs re-auth hint', async () => {
    mockRefresh.mockResolvedValue(err(new AuthError('invalid_grant')));
    seedOAuthSession();

    const summary = await runCycle();

    expect(summary).toMatchObject({ rotated: 0, failed: 1 });
    // session NOT deleted
    expect(fs.existsSync(path.join(projDir, '.linear', 'auth.json'))).toBe(true);
    // registry entry untouched
    expect(listProjects()._unsafeUnwrap()).toHaveLength(1);
    const log = fs.readFileSync(path.join(tmpHome, 'keepalive.log'), 'utf-8');
    expect(log).toContain('invalid_grant');
    expect(log).toContain('needs interactive re-auth');
  });

  it('generic refresh failure counts as failed but still logs', async () => {
    mockRefresh.mockResolvedValue(err(new NetworkError('network down')));
    seedOAuthSession();

    const summary = await runCycle();

    expect(summary.failed).toBe(1);
    const log = fs.readFileSync(path.join(tmpHome, 'keepalive.log'), 'utf-8');
    expect(log).toContain('network down');
  });

  it('skips when the lock is held by a live process', async () => {
    seedOAuthSession();
    const lockPath = path.join(projDir, '.linear', 'auth.lock');
    fs.writeFileSync(lockPath, `${process.pid}:${Date.now()}`, 'utf-8');

    const summary = await runCycle();

    expect(summary).toMatchObject({ skipped: 1, rotated: 0 });
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it('clears a stale lock (dead PID) and proceeds with rotation', async () => {
    seedOAuthSession();
    const lockPath = path.join(projDir, '.linear', 'auth.lock');
    fs.writeFileSync(lockPath, `${deadPid()}:${Date.now()}`, 'utf-8');
    mockRefresh.mockResolvedValue(
      ok({ accessToken: 'new-at', refreshToken: 'new-rt', expiresAt: Date.now() + 3600_000 })
    );

    const summary = await runCycle();

    expect(summary.rotated).toBe(1);
    expect(mockRefresh).toHaveBeenCalled();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('clears a stale lock (older than 30 min) and proceeds with rotation', async () => {
    seedOAuthSession();
    const lockPath = path.join(projDir, '.linear', 'auth.lock');
    fs.writeFileSync(lockPath, `${process.pid}:${Date.now() - 31 * 60 * 1000}`, 'utf-8');
    mockRefresh.mockResolvedValue(
      ok({ accessToken: 'new-at', refreshToken: 'new-rt', expiresAt: Date.now() + 3600_000 })
    );

    const summary = await runCycle();

    expect(summary.rotated).toBe(1);
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('TOCTOU: re-read after lock shows a fresh session → skip and release lock', async () => {
    seedOAuthSession();
    const lockPath = path.join(projDir, '.linear', 'auth.lock');
    // Pre-check sees a due session; by the time the lock is acquired the
    // session has been refreshed elsewhere → post-lock re-read is not due.
    const stale: OAuthSession = {
      accessToken: 'old-at',
      refreshToken: 'old-rt',
      expiresAt: Date.now() + 3600_000,
      lastRefreshAt: Date.now() - 25 * 3600_000,
    };
    const fresh: OAuthSession = { ...stale, lastRefreshAt: Date.now() };
    const spy = vi
      .spyOn(sessionMod, 'readProjectSession')
      .mockReturnValueOnce(stale)
      .mockReturnValueOnce(fresh);

    const summary = await runCycle();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ checked: 1, rotated: 0, skipped: 1, failed: 0 });
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('skips API-key sessions (nothing to rotate)', async () => {
    expect(writeProjectSession(projDir, { apiKey: 'lin_key_123' }).isOk()).toBe(true);
    expect(registerProject(projDir).isOk()).toBe(true);

    const summary = await runCycle();

    expect(summary).toMatchObject({ skipped: 1, rotated: 0 });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
