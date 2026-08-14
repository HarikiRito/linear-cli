import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as scopeMod from '../../../lib/scope.js';
import {
  getRegistryPath,
  linkProject,
  listProjects,
  registerGlobal,
  registerProject,
  unregisterProject,
} from '../registry.js';

describe('project registry', () => {
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

  it('registerProject writes projects.json with 0o600 file and 0o700 dir', () => {
    const result = registerProject(projA);
    expect(result.isOk()).toBe(true);

    const registry = JSON.parse(fs.readFileSync(getRegistryPath(), 'utf-8')) as {
      projects: Array<{ root: string; addedAt: number }>;
    };
    expect(registry.projects).toHaveLength(1);
    expect(registry.projects[0].root).toBe(fs.realpathSync(projA));
    expect(registry.projects[0].addedAt).toBeGreaterThan(0);
    expect(fs.statSync(getRegistryPath()).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(getRegistryPath())).mode & 0o777).toBe(0o700);
  });

  it('registerProject dedups the same root', () => {
    registerProject(projA);
    const second = registerProject(projA);
    expect(second.isOk()).toBe(true);
    expect(listProjects()._unsafeUnwrap()).toHaveLength(1);
  });

  it('registerProject dedups roots that resolve to the same realpath', () => {
    registerProject(projA);
    const alias = path.join(projA, '..', path.basename(projA));
    registerProject(alias);
    expect(listProjects()._unsafeUnwrap()).toHaveLength(1);
  });

  it('unregisterProject removes the matching entry', () => {
    registerProject(projA);
    registerProject(projB);
    const result = unregisterProject(projA);
    expect(result.isOk()).toBe(true);

    const projects = listProjects()._unsafeUnwrap();
    expect(projects).toHaveLength(1);
    expect(projects[0].root).toBe(fs.realpathSync(projB));
  });

  it('unregisterProject is idempotent for unknown roots', () => {
    const result = unregisterProject(projA);
    expect(result.isOk()).toBe(true);
    expect(listProjects()._unsafeUnwrap()).toEqual([]);
  });

  it('listProjects reads entries back from disk', () => {
    registerProject(projA);
    const projects = listProjects()._unsafeUnwrap();
    expect(projects).toHaveLength(1);
    expect(projects[0].root).toBe(fs.realpathSync(projA));
    expect(projects[0].addedAt).toEqual(expect.any(Number));
  });

  it('treats a missing or malformed registry as empty', () => {
    expect(listProjects()._unsafeUnwrap()).toEqual([]);
    fs.writeFileSync(getRegistryPath(), '{not valid json', 'utf-8');
    expect(listProjects()._unsafeUnwrap()).toEqual([]);
  });

  it('registerGlobal writes a global entry and dedups', () => {
    expect(registerGlobal().isOk()).toBe(true);
    expect(registerGlobal().isOk()).toBe(true);

    const projects = listProjects()._unsafeUnwrap();
    expect(projects).toHaveLength(1);
    expect(projects[0].scope).toBe('global');
    expect(projects[0].root).toBe(tmpHome);
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

  it('entries without workspace/team still load (backward compat)', () => {
    registerProject(projA);
    const projects = listProjects()._unsafeUnwrap();
    expect(projects).toHaveLength(1);
    expect(projects[0].workspace).toBeUndefined();
    expect(projects[0].team).toBeUndefined();
  });
});
