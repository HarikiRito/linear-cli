import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as scopeMod from '../../../lib/scope.js';
import {
  getEntry,
  getRegistryPath,
  linkProject,
  listProjects,
  unregisterProject,
  updateEntry,
} from '../registry.js';

describe('project registry (linkage only)', () => {
  let tmpHome: string;
  let projA: string;
  let projB: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-registry-home-'));
    projA = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-registry-a-'));
    projB = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-registry-b-'));
    vi.spyOn(scopeMod, 'getGlobalConfigDir').mockReturnValue(tmpHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(projA, { recursive: true, force: true });
    fs.rmSync(projB, { recursive: true, force: true });
  });

  it('linkProject writes projects.json with 0o600 file and 0o700 dir', async () => {
    await linkProject(projA, 'ws-1');

    const registry = JSON.parse(fs.readFileSync(getRegistryPath(), 'utf-8')) as {
      projects: Array<{ root: string; workspace: string; addedAt: number }>;
    };
    expect(registry.projects).toHaveLength(1);
    expect(registry.projects[0].root).toBe(fs.realpathSync(projA));
    expect(registry.projects[0].workspace).toBe('ws-1');
    expect(registry.projects[0].addedAt).toBeGreaterThan(0);
    expect(fs.statSync(getRegistryPath()).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(getRegistryPath())).mode & 0o777).toBe(0o700);
  });

  it('linkProject dedups the same root', async () => {
    await linkProject(projA, 'ws-1');
    await linkProject(projA, 'ws-2');
    expect(listProjects()._unsafeUnwrap()).toHaveLength(1);
  });

  it('linkProject dedups roots that resolve to the same realpath', async () => {
    await linkProject(projA, 'ws-1');
    const alias = path.join(projA, '..', path.basename(projA));
    await linkProject(alias, 'ws-2');
    expect(listProjects()._unsafeUnwrap()).toHaveLength(1);
  });

  it('unregisterProject removes the matching entry', async () => {
    await linkProject(projA, 'ws-1');
    await linkProject(projB, 'ws-2');
    const result = await unregisterProject(projA);
    expect(result.isOk()).toBe(true);

    const projects = listProjects()._unsafeUnwrap();
    expect(projects).toHaveLength(1);
    expect(projects[0].root).toBe(fs.realpathSync(projB));
  });

  it('unregisterProject is idempotent for unknown roots', async () => {
    const result = await unregisterProject(projA);
    expect(result.isOk()).toBe(true);
    expect(listProjects()._unsafeUnwrap()).toEqual([]);
  });

  it('listProjects reads entries back from disk', async () => {
    await linkProject(projA, 'ws-1');
    const projects = listProjects()._unsafeUnwrap();
    expect(projects).toHaveLength(1);
    expect(projects[0].root).toBe(fs.realpathSync(projA));
    expect(projects[0].workspace).toBe('ws-1');
    expect(projects[0].addedAt).toEqual(expect.any(Number));
  });

  it('treats a missing or malformed registry as empty', () => {
    expect(listProjects()._unsafeUnwrap()).toEqual([]);
    fs.writeFileSync(getRegistryPath(), '{not valid json', 'utf-8');
    expect(listProjects()._unsafeUnwrap()).toEqual([]);
  });

  it('filters out stale entries without a workspace field on read (file untouched)', () => {
    // Old-model global-sentinel artifacts: `{root, scope}` with no workspace.
    const registryPath = getRegistryPath();
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        projects: [
          { root: '~/.config/.linear', scope: 'global', addedAt: 123 },
          { root: fs.realpathSync(projA), workspace: 'ws-1', addedAt: 456 },
          null,
          'garbage',
        ],
      }),
      'utf-8'
    );

    const projects = listProjects()._unsafeUnwrap();
    expect(projects).toHaveLength(1);
    expect(projects[0].root).toBe(fs.realpathSync(projA));
    expect(projects[0].workspace).toBe('ws-1');
    expect(projects[0]).not.toHaveProperty('scope');

    // Read-only: the stale entry is filtered in memory, never rewritten.
    expect(fs.readFileSync(registryPath, 'utf-8')).toContain('"scope":"global"');
  });

  it('getEntry ignores stale no-workspace entries', () => {
    const registryPath = getRegistryPath();
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        projects: [{ root: projA, scope: 'global', addedAt: 123 }],
      }),
      'utf-8'
    );

    expect(getEntry(projA)).toBeUndefined();
  });

  it('linkProject creates a new entry with workspace and team', async () => {
    const entry = await linkProject(projA, 'ws-1', { id: 'team-1', key: 'T1' });

    expect(entry.root).toBe(fs.realpathSync(projA));
    expect(entry.workspace).toBe('ws-1');
    expect(entry.team).toEqual({ id: 'team-1', key: 'T1' });
    expect(entry.addedAt).toBeGreaterThan(0);

    const projects = listProjects()._unsafeUnwrap();
    expect(projects).toHaveLength(1);
    expect(projects[0].workspace).toBe('ws-1');
    expect(projects[0].team).toEqual({ id: 'team-1', key: 'T1' });
  });

  it('linkProject without team omits the field', async () => {
    const entry = await linkProject(projA, 'ws-1');
    expect(entry.workspace).toBe('ws-1');
    expect(entry.team).toBeUndefined();
  });

  it('linkProject on existing realpath updates workspace/team in place (no dup)', async () => {
    await linkProject(projA, 'ws-1', { id: 'team-1', key: 'T1' });
    const addedAt = listProjects()._unsafeUnwrap()[0].addedAt;

    // Same dir via a path alias that resolves to the same realpath.
    const alias = path.join(projA, '..', path.basename(projA));
    const updated = await linkProject(alias, 'ws-2', { id: 'team-2', key: 'T2' });

    expect(updated.workspace).toBe('ws-2');
    expect(updated.team).toEqual({ id: 'team-2', key: 'T2' });
    expect(updated.addedAt).toBe(addedAt); // addedAt untouched on update

    const projects = listProjects()._unsafeUnwrap();
    expect(projects).toHaveLength(1);
    expect(projects[0].workspace).toBe('ws-2');
    expect(projects[0].team).toEqual({ id: 'team-2', key: 'T2' });
  });

  it('linkProject replaces the team override on re-link', async () => {
    await linkProject(projA, 'ws-1', { id: 'team-1', key: 'T1' });
    const updated = await linkProject(projA, 'ws-1', { id: 'team-2', key: 'T2' });
    expect(updated.team).toEqual({ id: 'team-2', key: 'T2' });
  });

  it('updateEntry patches a field (e.g. team override) by root', async () => {
    await linkProject(projA, 'ws-1');
    const result = await updateEntry(projA, { team: { id: 'team-1', key: 'T1' } });
    expect(result.isOk()).toBe(true);

    const entry = getEntry(projA);
    expect(entry?.team).toEqual({ id: 'team-1', key: 'T1' });
    expect(entry?.workspace).toBe('ws-1');
  });

  it('updateEntry round-trips a project selection', async () => {
    await linkProject(projA, 'ws-1');
    const result = await updateEntry(projA, {
      projects: [
        { id: 'p1', name: 'Roadmap' },
        { id: 'p2', name: 'Infra' },
      ],
    });
    expect(result.isOk()).toBe(true);

    const entry = getEntry(projA);
    expect(entry?.projects).toEqual([
      { id: 'p1', name: 'Roadmap' },
      { id: 'p2', name: 'Infra' },
    ]);

    const registry = JSON.parse(fs.readFileSync(getRegistryPath(), 'utf-8')) as {
      projects: Array<{ root: string; projects?: { id: string; name: string }[] }>;
    };
    expect(registry.projects[0].projects).toEqual([
      { id: 'p1', name: 'Roadmap' },
      { id: 'p2', name: 'Infra' },
    ]);
  });

  it('old entries without a projects field remain valid (backward compatible)', async () => {
    await linkProject(projA, 'ws-1');
    const entry = getEntry(projA);
    expect(entry?.projects).toBeUndefined();
  });
});
