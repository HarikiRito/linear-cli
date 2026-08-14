import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Result } from 'neverthrow';
import { listProjects } from '../features/keepalive/registry.js';

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

/**
 * Walk from startDir upward, returning the nearest ancestor registered as a
 * linked project root (projects.json registry match). Returns the registry
 * entry's canonical root (which may be an ancestor of startDir), or null when
 * no ancestor is linked.
 */
export function findProjectRoot(startDir: string): string | null {
  const entryRoots = new Set(
    listProjects()
      .unwrapOr([])
      .map((e) => realpathOrSelf(e.root))
  );
  let dir = realpathOrSelf(path.resolve(startDir));
  const { root } = path.parse(dir);
  while (true) {
    if (entryRoots.has(dir)) return dir;
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}
