import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as scopeMod from '../../../lib/scope.js';
import {
  clearWorkspaceBackoff,
  deleteWorkspaceState,
  getKeepaliveStatePath,
  readKeepaliveState,
  readWorkspaceState,
  updateWorkspaceState,
  writeKeepaliveState,
} from '../state.js';

describe('keepalive-state.json (per-workspace backoff)', () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-state-home-'));
    vi.spyOn(scopeMod, 'getGlobalConfigDir').mockReturnValue(tmpHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('round-trips state with 0o600 file / 0o700 dir modes', async () => {
    const state = {
      workspaces: { 'ws-1': { invalidGrantTier: 1, invalidGrantNextAttemptAt: 123 } },
    };
    await writeKeepaliveState(state);

    expect(await readKeepaliveState()).toEqual(state);
    expect(fs.statSync(getKeepaliveStatePath()).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(getKeepaliveStatePath())).mode & 0o777).toBe(0o700);
  });

  it('readWorkspaceState returns {} for an unknown workspace', async () => {
    expect(await readWorkspaceState('nope')).toEqual({});
  });

  it('updateWorkspaceState merges onto the existing workspace entry', async () => {
    await updateWorkspaceState('ws-1', { invalidGrantTier: 1 });
    await updateWorkspaceState('ws-1', { invalidGrantNextAttemptAt: 456 });

    expect(await readWorkspaceState('ws-1')).toEqual({
      invalidGrantTier: 1,
      invalidGrantNextAttemptAt: 456,
    });
  });

  it('clearWorkspaceBackoff removes backoff fields (and the entry when empty)', async () => {
    await updateWorkspaceState('ws-1', { invalidGrantTier: 2, invalidGrantNextAttemptAt: 123 });
    await clearWorkspaceBackoff('ws-1');

    expect(await readWorkspaceState('ws-1')).toEqual({});
    expect(await readKeepaliveState()).toEqual({ workspaces: {} });
  });

  it('clearWorkspaceBackoff is a no-op for an unknown workspace', async () => {
    await clearWorkspaceBackoff('nope');
    expect(await readKeepaliveState()).toEqual({ workspaces: {} });
  });

  it('deleteWorkspaceState removes the whole entry', async () => {
    await updateWorkspaceState('ws-1', { invalidGrantTier: 1 });
    await updateWorkspaceState('ws-2', { invalidGrantTier: 3 });
    await deleteWorkspaceState('ws-1');

    expect(await readKeepaliveState()).toEqual({
      workspaces: { 'ws-2': { invalidGrantTier: 3 } },
    });
  });

  it('tolerates a missing or malformed state file', async () => {
    expect(await readKeepaliveState()).toEqual({ workspaces: {} });

    fs.mkdirSync(tmpHome, { recursive: true });
    fs.writeFileSync(getKeepaliveStatePath(), '{not valid json', 'utf-8');
    expect(await readKeepaliveState()).toEqual({ workspaces: {} });

    fs.writeFileSync(getKeepaliveStatePath(), JSON.stringify({ workspaces: [] }), 'utf-8');
    expect(await readKeepaliveState()).toEqual({ workspaces: {} });
  });
});
