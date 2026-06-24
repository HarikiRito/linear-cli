import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Result } from 'neverthrow';

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
  const statSync = Result.fromThrowable(
    (p: string) => fs.statSync(p),
    () => null
  );
  while (true) {
    const candidate = path.join(dir, '.linear');
    const statResult = statSync(candidate);
    if (statResult.isOk() && statResult.value.isDirectory()) {
      return dir;
    }
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}
