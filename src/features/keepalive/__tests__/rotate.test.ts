import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { err, errAsync, ok, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, NetworkError } from '../../../lib/errors.js';

// refreshAccessToken is the only network boundary — mock it entirely.
vi.mock('../../auth/oauth.js', () => ({
  startOAuthFlow: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

import * as scopeMod from '../../../lib/scope.js';
import { readWorkspaceCredential, writeWorkspaceCredential } from '../../auth/credentials.js';
import { refreshAccessToken } from '../../auth/oauth.js';
import { linkProject, listProjects } from '../registry.js';
import { type RotationSummary, runKeepaliveCycle } from '../rotate.js';
import { readKeepaliveState, readWorkspaceState, updateWorkspaceState } from '../state.js';

const mockRefresh = vi.mocked(refreshAccessToken);

function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', '']);
  expect(child.status).toBe(0);
  return child.pid ?? 0;
}

function lockPath(workspaceId: string): string {
  return path.join(tmpHome, 'keepalive', `${workspaceId}.lock`);
}

let tmpHome: string;
let projDir: string;

describe('keepalive rotation cycle (per-workspace)', () => {
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

  /** Write a due-by-default OAuth workspace credential. */
  async function seedOAuthSession(
    workspaceId = 'ws-1',
    overrides: Partial<Parameters<typeof writeWorkspaceCredential>[1]> = {}
  ): Promise<void> {
    const session = {
      accessToken: 'old-at',
      refreshToken: 'old-rt',
      expiresAt: Date.now() + 3600_000,
      lastRefreshAt: Date.now() - 25 * 3600_000, // 25h old → due
      ...overrides,
    };
    await writeWorkspaceCredential(workspaceId, session);
  }

  async function runCycle(): Promise<RotationSummary> {
    const result = await runKeepaliveCycle();
    if (result.isErr()) throw result.error;
    return result.value;
  }

  it('skips rotation when last refresh is < 24h old (no network call)', async () => {
    await seedOAuthSession('ws-1', { lastRefreshAt: Date.now() });

    const summary = await runCycle();

    expect(summary).toMatchObject({ checked: 1, rotated: 0, skipped: 1, failed: 0, pruned: 0 });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('rotates when last refresh is >= 24h old and persists via the workspace credential', async () => {
    const before = Date.now();
    mockRefresh.mockResolvedValue(
      ok({ accessToken: 'new-at', refreshToken: 'new-rt', expiresAt: before + 3600_000 })
    );
    await seedOAuthSession();

    const summary = await runCycle();

    expect(summary).toMatchObject({ checked: 1, rotated: 1, skipped: 0, failed: 0 });
    expect(mockRefresh).toHaveBeenCalledWith('old-rt');
    const stored = await readWorkspaceCredential('ws-1');
    expect(stored).toMatchObject({ accessToken: 'new-at', refreshToken: 'new-rt' });
    expect((stored as { lastRefreshAt: number }).lastRefreshAt).toBeGreaterThanOrEqual(before);
    // lock released after rotation
    expect(fs.existsSync(lockPath('ws-1'))).toBe(false);
  });

  it('treats a missing lastRefreshAt as 0 (due immediately)', async () => {
    mockRefresh.mockResolvedValue(
      ok({ accessToken: 'new-at', refreshToken: 'new-rt', expiresAt: Date.now() + 3600_000 })
    );
    await seedOAuthSession('ws-1', { lastRefreshAt: undefined });

    const summary = await runCycle();

    expect(summary.rotated).toBe(1);
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('prunes keepalive state for a workspace whose credential no longer exists', async () => {
    await updateWorkspaceState('ws-missing', { invalidGrantTier: 2, invalidGrantNextAttemptAt: 1 });
    const credMod = await import('../../auth/credentials.js');
    vi.spyOn(credMod, 'listWorkspaceIds').mockResolvedValue(['ws-missing']);

    const summary = await runCycle();

    expect(summary).toMatchObject({ checked: 1, pruned: 1, rotated: 0 });
    expect(await readKeepaliveState()).toEqual({ workspaces: {} });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('invalid_grant failure counts as failed, keeps the credential, logs re-auth hint', async () => {
    mockRefresh.mockResolvedValue(err(new AuthError('invalid_grant')));
    await seedOAuthSession();

    const summary = await runCycle();

    expect(summary).toMatchObject({ rotated: 0, failed: 1 });
    // credential NOT deleted
    expect(await readWorkspaceCredential('ws-1')).not.toBeNull();
    // backoff recorded per workspace in keepalive-state.json
    const state = await readWorkspaceState('ws-1');
    expect(state.invalidGrantTier).toBe(1);
    expect(state.invalidGrantNextAttemptAt).toBeGreaterThan(Date.now());
    const log = fs.readFileSync(path.join(tmpHome, 'keepalive.log'), 'utf-8');
    expect(log).toContain('invalid_grant');
    expect(log).toContain('backing off');
    expect(log).toContain('tier 1');
  });

  it('invalid_grant skips subsequent cycle until backoff expires', async () => {
    mockRefresh.mockResolvedValue(err(new AuthError('invalid_grant')));
    await seedOAuthSession();

    const first = await runCycle();
    expect(first).toMatchObject({ rotated: 0, failed: 1 });
    const state = await readWorkspaceState('ws-1');
    expect(state.invalidGrantTier).toBe(1);
    expect(state.invalidGrantNextAttemptAt).toBeGreaterThan(Date.now());

    mockRefresh.mockReset(); // clear — lets us detect non-invocation

    const second = await runCycle();
    expect(second).toMatchObject({ checked: 1, skipped: 1, rotated: 0, failed: 0 });
    expect(mockRefresh).not.toHaveBeenCalled();
    expect((await readWorkspaceState('ws-1')).invalidGrantTier).toBe(1);
  });

  it('successful rotation clears invalid_grant backoff', async () => {
    await seedOAuthSession();
    // Backoff already expired — cycle must proceed despite the tier.
    await updateWorkspaceState('ws-1', {
      invalidGrantTier: 3,
      invalidGrantNextAttemptAt: Date.now() - 1000,
    });

    mockRefresh.mockResolvedValue(
      ok({ accessToken: 'new-at', refreshToken: 'new-rt', expiresAt: Date.now() + 3600_000 })
    );

    const summary = await runCycle();

    expect(summary).toMatchObject({ rotated: 1, failed: 0 });
    const state = await readWorkspaceState('ws-1');
    expect(state.invalidGrantTier).toBeUndefined();
    expect(state.invalidGrantNextAttemptAt).toBeUndefined();
  });

  it('rotates one workspace per credential even when multiple dirs link to it', async () => {
    await seedOAuthSession('ws-1');
    await linkProject(projDir, 'ws-1');
    const projDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-rotate-proj2-'));
    await linkProject(projDir2, 'ws-1'); // second link, same workspace

    mockRefresh.mockResolvedValue(
      ok({ accessToken: 'new-at', refreshToken: 'new-rt', expiresAt: Date.now() + 3600_000 })
    );

    const summary = await runCycle();

    // One rotation for the workspace, not one per linked directory.
    expect(summary).toMatchObject({ checked: 1, rotated: 1, skipped: 0, failed: 0 });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(await readWorkspaceCredential('ws-1')).toMatchObject({ accessToken: 'new-at' });
    expect(listProjects()._unsafeUnwrap()).toHaveLength(2);
    fs.rmSync(projDir2, { recursive: true, force: true });
  });

  it('rotates multiple workspaces in one cycle', async () => {
    await seedOAuthSession('ws-1');
    await writeWorkspaceCredential('ws-2', {
      accessToken: 'old-at-2',
      refreshToken: 'old-rt-2',
      expiresAt: Date.now() + 3600_000,
      lastRefreshAt: Date.now() - 25 * 3600_000,
    });

    mockRefresh.mockResolvedValue(
      ok({ accessToken: 'new-at', refreshToken: 'new-rt', expiresAt: Date.now() + 3600_000 })
    );

    const summary = await runCycle();

    expect(summary).toMatchObject({ checked: 2, rotated: 2, failed: 0 });
    expect(mockRefresh).toHaveBeenCalledTimes(2);
    expect(await readWorkspaceCredential('ws-1')).toMatchObject({ accessToken: 'new-at' });
    expect(await readWorkspaceCredential('ws-2')).toMatchObject({ accessToken: 'new-at' });
  });

  it('generic refresh failure counts as failed but still logs', async () => {
    mockRefresh.mockResolvedValue(err(new NetworkError('network down')));
    await seedOAuthSession();

    const summary = await runCycle();

    expect(summary.failed).toBe(1);
    const log = fs.readFileSync(path.join(tmpHome, 'keepalive.log'), 'utf-8');
    expect(log).toContain('network down');
  });

  it('skips when the per-workspace lock is held by a live process', async () => {
    await seedOAuthSession();
    fs.mkdirSync(path.dirname(lockPath('ws-1')), { recursive: true });
    fs.writeFileSync(lockPath('ws-1'), `${process.pid}:${Date.now()}`, 'utf-8');

    const summary = await runCycle();

    expect(summary).toMatchObject({ skipped: 1, rotated: 0 });
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(fs.existsSync(lockPath('ws-1'))).toBe(true);
  });

  it('clears a stale lock (dead PID) and proceeds with rotation', async () => {
    await seedOAuthSession();
    fs.mkdirSync(path.dirname(lockPath('ws-1')), { recursive: true });
    fs.writeFileSync(lockPath('ws-1'), `${deadPid()}:${Date.now()}`, 'utf-8');
    mockRefresh.mockResolvedValue(
      ok({ accessToken: 'new-at', refreshToken: 'new-rt', expiresAt: Date.now() + 3600_000 })
    );

    const summary = await runCycle();

    expect(summary.rotated).toBe(1);
    expect(mockRefresh).toHaveBeenCalled();
    expect(fs.existsSync(lockPath('ws-1'))).toBe(false);
  });

  it('TOCTOU: re-read after lock shows a fresh session → skip and release lock', async () => {
    await seedOAuthSession();
    const fresh = {
      accessToken: 'old-at',
      refreshToken: 'old-rt',
      expiresAt: Date.now() + 3600_000,
      lastRefreshAt: Date.now(), // refreshed elsewhere
    };
    // First read (pre-lock) sees the due session; post-lock read sees the fresh one.
    const credMod = await import('../../auth/credentials.js');
    const wsReadSpy = vi
      .spyOn(credMod, 'readWorkspaceCredential')
      .mockResolvedValueOnce({
        accessToken: 'old-at',
        refreshToken: 'old-rt',
        expiresAt: Date.now() + 3600_000,
        lastRefreshAt: Date.now() - 25 * 3600_000,
      })
      .mockResolvedValueOnce(fresh);

    const summary = await runCycle();

    expect(wsReadSpy).toHaveBeenCalledTimes(2);
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ checked: 1, rotated: 0, skipped: 1, failed: 0 });
    expect(fs.existsSync(lockPath('ws-1'))).toBe(false);
  });

  it('skips API-key sessions (nothing to rotate)', async () => {
    await writeWorkspaceCredential('ws-key', { apiKey: 'lin_key_123' });

    const summary = await runCycle();

    expect(summary).toMatchObject({ skipped: 1, rotated: 0 });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('state-write failure counts as failed and other workspaces still rotate', async () => {
    const stateMod = await import('../state.js');
    // ws-1's invalid_grant backoff record write blows up (ENOSPC etc.)…
    vi.spyOn(stateMod, 'updateWorkspaceState').mockRejectedValue(new Error('ENOSPC'));
    mockRefresh.mockImplementation((token: string) =>
      token === 'old-rt'
        ? errAsync(new AuthError('invalid_grant'))
        : okAsync({
            accessToken: 'new-at',
            refreshToken: 'new-rt',
            expiresAt: Date.now() + 3600_000,
          })
    );
    await seedOAuthSession('ws-1');
    await writeWorkspaceCredential('ws-2', {
      accessToken: 'old-at-2',
      refreshToken: 'old-rt-2',
      expiresAt: Date.now() + 3600_000,
      lastRefreshAt: Date.now() - 25 * 3600_000,
    });

    // Must NOT reject — the failure is folded into summary.failed.
    const summary = await runCycle();

    expect(summary).toMatchObject({ checked: 2, rotated: 1, failed: 2 });
    // The other workspace still rotated and persisted.
    expect(await readWorkspaceCredential('ws-2')).toMatchObject({ accessToken: 'new-at' });
    const log = fs.readFileSync(path.join(tmpHome, 'keepalive.log'), 'utf-8');
    expect(log).toContain('backoff state');
  });
});
