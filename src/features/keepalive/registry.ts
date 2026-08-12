import fs from 'node:fs';
import path from 'node:path';
import { ok, Result } from 'neverthrow';
import { toError } from '../../lib/errors.js';
import { getGlobalConfigDir, getProjectLinearDir } from '../../lib/scope.js';

export interface RegisteredProject {
  root: string;
  addedAt: number;
}

interface RegistryFile {
  projects: RegisteredProject[];
}

export function getRegistryPath(): string {
  return path.join(getGlobalConfigDir(), 'projects.json');
}

/** realpath when resolvable, else the path as given (missing dirs throw). */
function realpathOrSelf(p: string): string {
  return Result.fromThrowable(
    (x: string) => fs.realpathSync(x),
    () => undefined
  )(p).unwrapOr(p);
}

function readRegistry(): RegistryFile {
  const result = Result.fromThrowable(
    () => JSON.parse(fs.readFileSync(getRegistryPath(), 'utf-8')) as RegistryFile,
    toError
  )();
  // Missing or malformed registry — start fresh.
  if (result.isErr() || !Array.isArray(result.value.projects)) return { projects: [] };
  return result.value;
}

function writeRegistry(registry: RegistryFile): Result<void, Error> {
  return Result.fromThrowable(() => {
    const p = getRegistryPath();
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify(registry, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }, toError)();
}

/** Idempotent: add root (deduped by realpath) to the keepalive registry. */
export function registerProject(root: string): Result<void, Error> {
  const canonical = realpathOrSelf(root);
  const registry = readRegistry();
  if (registry.projects.some((p) => realpathOrSelf(p.root) === canonical)) {
    return ok(undefined);
  }
  registry.projects.push({ root: canonical, addedAt: Date.now() });
  return writeRegistry(registry);
}

/** Idempotent: remove root (compared via realpath) from the registry. */
export function unregisterProject(root: string): Result<void, Error> {
  const canonical = realpathOrSelf(root);
  const registry = readRegistry();
  const filtered = registry.projects.filter((p) => realpathOrSelf(p.root) !== canonical);
  if (filtered.length === registry.projects.length) return ok(undefined);
  return writeRegistry({ projects: filtered });
}

export function listProjects(): Result<RegisteredProject[], Error> {
  return ok(readRegistry().projects);
}

/** Drop entries whose root dir or <root>/.linear/auth.json no longer exists. */
export function pruneMissing(): Result<{ pruned: number }, Error> {
  const registry = readRegistry();
  const alive = registry.projects.filter((p) => {
    const authPath = path.join(getProjectLinearDir(p.root), 'auth.json');
    return fs.existsSync(p.root) && fs.existsSync(authPath);
  });
  const pruned = registry.projects.length - alive.length;
  if (pruned === 0) return ok({ pruned: 0 });
  return writeRegistry({ projects: alive }).map(() => ({ pruned }));
}
