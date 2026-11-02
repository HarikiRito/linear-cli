import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpProjectAndHome } from '../../../tests/helpers/tmp-env.js';
import { getEntry, linkProject } from '../../features/keepalive/registry.js';
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

  describe('git worktrees', () => {
    const git = (cwd: string, ...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        cwd,
        stdio: 'pipe',
      });

    function makeRepoWithWorktree() {
      const main = path.join(tmpEnv.projectDir, 'main');
      const wt = path.join(tmpEnv.projectDir, 'wt');
      fs.mkdirSync(main);
      git(main, 'init', '-q');
      git(main, 'commit', '-q', '--allow-empty', '-m', 'init');
      git(main, 'worktree', 'add', '-q', wt);
      return { main: fs.realpathSync(main), wt };
    }

    it('resolves a worktree of a linked repo to the main root entry', async () => {
      const { main, wt } = makeRepoWithWorktree();
      await linkProject(main, 'ws-1', { id: 't1', key: 'ENG' });
      const sub = path.join(wt, 'a');
      fs.mkdirSync(sub);

      for (const dir of [wt, sub]) {
        const root = findProjectRoot(dir);
        expect(root).toBe(main);
        expect(getEntry(root as string)).toMatchObject({
          workspace: 'ws-1',
          team: { id: 't1', key: 'ENG' },
        });
      }
    });

    it('prefers a direct link on the worktree over the main repo link', async () => {
      const { main, wt } = makeRepoWithWorktree();
      await linkProject(main, 'ws-main');
      await linkProject(wt, 'ws-wt');

      expect(findProjectRoot(wt)).toBe(fs.realpathSync(wt));
    });

    it('returns null for a worktree of an unlinked repo and for non-git dirs', () => {
      const { wt } = makeRepoWithWorktree();
      expect(findProjectRoot(wt)).toBeNull();
      expect(
        findProjectRoot(fs.mkdtempSync(path.join(tmpEnv.projectDir, 'linear-nogit-')))
      ).toBeNull();
    });

    it('returns null without throwing when git is unavailable', async () => {
      const { main, wt } = makeRepoWithWorktree();
      await linkProject(main, 'ws-1');
      process.env.PATH = fs.mkdtempSync(path.join(tmpEnv.projectDir, 'linear-nopath-'));

      expect(findProjectRoot(wt)).toBeNull();
    });

    it('returns null without throwing when the linked main repo was deleted', async () => {
      const { main, wt } = makeRepoWithWorktree();
      await linkProject(main, 'ws-1');
      fs.rmSync(main, { recursive: true, force: true });

      expect(findProjectRoot(wt)).toBeNull();
    });
  });
});
