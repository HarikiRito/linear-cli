import fs from 'node:fs';
import path from 'node:path';
import { ok, Result } from 'neverthrow';
import { withConfigLock } from '../../lib/config-lock.js';
import { toError } from '../../lib/errors.js';
import { getGlobalConfigDir } from '../../lib/scope.js';

/** Linkage-only entry: a directory bound to a workspace (backoff lives in keepalive-state.json). */
export interface RegisteredProject {
  root: string;
  workspace: string;
  /** Team override for this linked dir. */
  team?: { id: string; key: string };
  /** Default project selection for this linked dir — hard-scopes commands run from it. */
  projects?: { id: string; name: string }[];
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
  if (result.isErr()) return { projects: [] };
  const raw = result.value as { projects?: unknown };
  if (!Array.isArray(raw.projects)) return { projects: [] };
  return {
    projects: raw.projects
      // Defensive read filter (file never rewritten by reads): drop stale
      // entries from the old global-sentinel model (no `workspace` field) and
      // any lingering `scope` field; skip malformed entries entirely.
      .filter(
        (p): p is RegisteredProject & { scope?: string } =>
          p !== null &&
          typeof p === 'object' &&
          typeof (p as { workspace?: unknown }).workspace === 'string'
      )
      .map(({ scope: _scope, ...rest }) => rest),
  };
}

function writeRegistry(registry: RegistryFile): Result<void, Error> {
  return Result.fromThrowable(() => {
    const p = getRegistryPath();
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify(registry, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }, toError)();
}

/** Idempotent: remove root (compared via realpath) from the registry. */
export function unregisterProject(root: string): Promise<Result<void, Error>> {
  return withConfigLock(() => {
    const canonical = realpathOrSelf(root);
    const registry = readRegistry();
    const filtered = registry.projects.filter((p) => realpathOrSelf(p.root) !== canonical);
    if (filtered.length === registry.projects.length) return ok(undefined);
    return writeRegistry({ projects: filtered });
  });
}

export function listProjects(): Result<RegisteredProject[], Error> {
  return ok(readRegistry().projects);
}

/** Find one entry by canonical root (realpath-compared). Returns undefined if absent. */
export function getEntry(root: string): RegisteredProject | undefined {
  const canonical = realpathOrSelf(root);
  return readRegistry().projects.find((p) => realpathOrSelf(p.root) === canonical);
}

/** Patch a registry entry by root. No-op if entry not found. */
export function updateEntry(
  root: string,
  patch: Partial<RegisteredProject>
): Promise<Result<void, Error>> {
  return withConfigLock(() => {
    const canonical = realpathOrSelf(root);
    const registry = readRegistry();
    const idx = registry.projects.findIndex((p) => realpathOrSelf(p.root) === canonical);
    if (idx === -1) return ok(undefined);
    registry.projects[idx] = { ...registry.projects[idx], ...patch };
    return writeRegistry(registry);
  });
}

/**
 * Link a directory to a workspace id (with optional team override). Realpath-
 * deduped: an existing entry for the same root is updated in place (workspace,
 * team replaced; addedAt untouched unless missing).
 */
export async function linkProject(
  root: string,
  workspaceId: string,
  team?: { id: string; key: string }
): Promise<RegisteredProject> {
  return withConfigLock(async () => {
    const canonical = realpathOrSelf(root);
    const registry = readRegistry();
    const idx = registry.projects.findIndex((p) => realpathOrSelf(p.root) === canonical);
    if (idx !== -1) {
      const existing = registry.projects[idx];
      const updated: RegisteredProject = {
        ...existing,
        workspace: workspaceId,
        ...(team !== undefined && { team }),
        addedAt: existing.addedAt ?? Date.now(),
      };
      registry.projects[idx] = updated;
      await writeRegistryFile(registry);
      return updated;
    }
    const entry: RegisteredProject = {
      root: canonical,
      workspace: workspaceId,
      ...(team !== undefined && { team }),
      addedAt: Date.now(),
    };
    registry.projects.push(entry);
    await writeRegistryFile(registry);
    return entry;
  });
}

/** Async persist used by linkProject (same path/modes as writeRegistry). */
async function writeRegistryFile(registry: RegistryFile): Promise<void> {
  const p = getRegistryPath();
  await fs.promises.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(p, JSON.stringify(registry, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}
