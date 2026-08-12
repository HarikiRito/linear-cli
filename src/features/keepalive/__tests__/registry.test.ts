import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as scopeMod from '../../../lib/scope.js';
import {
  getRegistryPath,
  listProjects,
  pruneMissing,
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

  it('pruneMissing removes entries whose auth.json is missing', () => {
    // projA has a session, projB does not
    const authA = path.join(projA, '.linear', 'auth.json');
    fs.mkdirSync(path.dirname(authA), { recursive: true });
    fs.writeFileSync(authA, JSON.stringify({ apiKey: 'k' }), 'utf-8');
    registerProject(projA);
    registerProject(projB);

    const result = pruneMissing();
    expect(result._unsafeUnwrap()).toEqual({ pruned: 1 });

    const projects = listProjects()._unsafeUnwrap();
    expect(projects).toHaveLength(1);
    expect(projects[0].root).toBe(fs.realpathSync(projA));
  });

  it('pruneMissing removes entries whose root dir is gone', () => {
    const authA = path.join(projA, '.linear', 'auth.json');
    fs.mkdirSync(path.dirname(authA), { recursive: true });
    fs.writeFileSync(authA, JSON.stringify({ apiKey: 'k' }), 'utf-8');
    registerProject(projA);
    const ghost = path.join(os.tmpdir(), `linear-registry-ghost-${Date.now()}`);
    registerProject(ghost); // dir does not exist

    const result = pruneMissing();
    expect(result._unsafeUnwrap()).toEqual({ pruned: 1 });
    expect(listProjects()._unsafeUnwrap()).toHaveLength(1);
  });
});
