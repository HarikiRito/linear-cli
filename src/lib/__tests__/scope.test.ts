import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpProjectAndHome } from '../../../tests/helpers/tmp-env.js';
import { linkProject, registerProject } from '../../features/keepalive/registry.js';
import { findProjectRoot } from '../scope.js';

/**
 * findProjectRoot now matches registry entries (projects.json) instead of
 * scanning for .linear/ directories.
 */
describe('scope: findProjectRoot (registry match)', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-scope-test-',
    homePrefix: 'linear-scope-home-',
  });

  it('finds the linked root when cwd is nested three levels deep', async () => {
    const nested = path.join(tmpEnv.projectDir, 'a', 'b', 'c');
    fs.mkdirSync(nested, { recursive: true });
    await linkProject(tmpEnv.projectDir, 'ws-1');

    const result = findProjectRoot(nested);
    expect(result).toBe(fs.realpathSync(tmpEnv.projectDir));
  });

  it('returns null when no ancestor is registered', () => {
    // tmpEnv.projectDir is not linked
    const result = findProjectRoot(tmpEnv.projectDir);
    expect(result).toBeNull();
  });

  it('returns the directory itself when it is the linked root', async () => {
    await linkProject(tmpEnv.projectDir, 'ws-1');

    const result = findProjectRoot(tmpEnv.projectDir);
    expect(result).toBe(fs.realpathSync(tmpEnv.projectDir));
  });

  it('finds the linked root one level up', async () => {
    const child = path.join(tmpEnv.projectDir, 'src');
    fs.mkdirSync(child);
    await linkProject(tmpEnv.projectDir, 'ws-1');

    const result = findProjectRoot(child);
    expect(result).toBe(fs.realpathSync(tmpEnv.projectDir));
  });

  it('matches entries registered without a workspace (unlinked registration)', () => {
    const nested = path.join(tmpEnv.projectDir, 'src');
    fs.mkdirSync(nested);
    registerProject(tmpEnv.projectDir);

    const result = findProjectRoot(nested);
    expect(result).toBe(fs.realpathSync(tmpEnv.projectDir));
  });
});
