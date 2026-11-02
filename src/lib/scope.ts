import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Result } from 'neverthrow';
import { listProjects } from '../features/keepalive/registry.js';
import { toError } from './errors.js';

/** Canonical global config dir: ~/.config/.linear */
export function getGlobalConfigDir(): string {
  return path.join(os.homedir(), '.config', '.linear');
}

/** realpath when resolvable, else the path as given (missing dirs fall back). */
function realpathOrSelf(p: string): string {
  return Result.fromThrowable(
    (x: string) => fs.realpathSync(x),
    () => undefined
  )(p).unwrapOr(p);
}

function findLinkedAncestor(startDir: string, entryRoots: Set<string>): string | null {
  let dir = realpathOrSelf(path.resolve(startDir));
  const { root } = path.parse(dir);
  while (true) {
    if (entryRoots.has(dir)) return dir;
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

/** Main repo root when startDir is inside a git worktree/repo, else null (git missing/failing too). */
function gitMainRoot(startDir: string): string | null {
  const cwd = path.resolve(startDir);
  return Result.fromThrowable(
    () =>
      execFileSync('git', ['rev-parse', '--git-common-dir'], {
        cwd,
        encoding: 'utf8',
        stdio: 'pipe',
      }).trim(),
    toError
  )()
    .map((out) => path.resolve(cwd, out))
    .map((gitDir) => (path.basename(gitDir) === '.git' ? path.dirname(gitDir) : null))
    .unwrapOr(null);
}

/**
 * Nearest linked ancestor of startDir, else the git main repo's link.
 * Null when none.
 */
export function findProjectRoot(startDir: string): string | null {
  const entryRoots = new Set(
    listProjects()
      .unwrapOr([])
      .map((e) => realpathOrSelf(e.root))
  );
  const direct = findLinkedAncestor(startDir, entryRoots);
  if (direct) return direct;
  const mainRoot = gitMainRoot(startDir);
  return mainRoot ? findLinkedAncestor(mainRoot, entryRoots) : null;
}
