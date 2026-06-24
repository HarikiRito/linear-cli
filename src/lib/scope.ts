import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Canonical global config dir: ~/.config/.linear */
export function getGlobalConfigDir(): string {
  return path.join(os.homedir(), '.config', '.linear');
}

/** Canonical project-scoped linear dir: <projectRoot>/.linear */
export function getProjectLinearDir(projectRoot: string): string {
  return path.join(projectRoot, '.linear');
}

/**
 * Walk from startDir upward looking for a .linear/ directory.
 * Returns the absolute path of the directory that CONTAINS .linear/, or null.
 */
export function findProjectRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const { root } = path.parse(dir);
  while (true) {
    const candidate = path.join(dir, '.linear');
    try {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) {
        return dir;
      }
    } catch {
      // not found or not accessible — continue
    }
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}
