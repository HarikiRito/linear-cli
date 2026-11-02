import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LinearClient } from '@linear/sdk';
import { errAsync, okAsync, Result, ResultAsync } from 'neverthrow';
import { withConfigLock } from '../../lib/config-lock.js';
import { type CliError, coerceCliError, toError, ValidationError } from '../../lib/errors.js';
import { getGlobalConfigDir } from '../../lib/scope.js';
import { listWorkspaceCredentials } from './credentials.js';
import { resolveSessionWithRefresh } from './refresh.js';
import type { Session } from './session.js';
import type { WorkspaceHint } from './workspace-hint.js';

interface WorkspaceIndex {
  /** Upper-cased team key → ids of the workspaces that have it. */
  teams: Record<string, string[]>;
  urlKeys: Record<string, string>;
  names: Record<string, { name: string; urlKey: string }>;
  /** Every stored workspace id attempted, including ones that could not be listed. */
  indexed: string[];
}

export const HOW_TO_CHOOSE =
  'Link this folder with `linear workspace select` or set LINEAR_WORKSPACE=<workspace-id>.';

function getIndexPath(): string {
  return path.join(getGlobalConfigDir(), 'workspace-index.json');
}

function isIndex(value: unknown): value is WorkspaceIndex {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<Record<keyof WorkspaceIndex, unknown>>;
  const isRecord = (x: unknown) => typeof x === 'object' && x !== null && !Array.isArray(x);
  return isRecord(v.teams) && isRecord(v.urlKeys) && isRecord(v.names) && Array.isArray(v.indexed);
}

/** Missing or corrupt cache file is a miss. */
async function readIndex(): Promise<WorkspaceIndex | null> {
  const content = await ResultAsync.fromPromise(
    readFile(getIndexPath(), 'utf-8'),
    toError
  ).unwrapOr('');
  const parsed = Result.fromThrowable(() => JSON.parse(content) as unknown, toError)().unwrapOr(
    null
  );
  return isIndex(parsed) ? parsed : null;
}

function writeIndex(index: WorkspaceIndex): Promise<void> {
  return withConfigLock(async () => {
    const p = getIndexPath();
    await mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
    await writeFile(p, `${JSON.stringify(index, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  });
}

function listWorkspace(
  id: string,
  session: Session
): ResultAsync<{ id: string; name: string; urlKey: string; teamKeys: string[] }, CliError> {
  return resolveSessionWithRefresh(session, id).andThen((cred) => {
    // Not buildLinearClient: client/index imports resolve.ts, which imports this module.
    const client = new LinearClient(
      cred.type === 'apiKey' ? { apiKey: cred.value } : { accessToken: cred.value }
    );
    return ResultAsync.fromPromise(
      Promise.all([client.organization, client.teams({ first: 250 })]),
      coerceCliError
    ).map(([org, teams]) => ({
      id,
      name: org.name,
      urlKey: org.urlKey,
      teamKeys: teams.nodes.map((t) => t.key),
    }));
  });
}

/** One listing per stored workspace; workspaces that fail (expired login, network) are left unindexed. */
async function buildIndex(sessions: Record<string, Session>): Promise<WorkspaceIndex> {
  const ids = Object.keys(sessions).sort();
  const results = await Promise.all(ids.map((id) => listWorkspace(id, sessions[id])));
  const index: WorkspaceIndex = { teams: {}, urlKeys: {}, names: {}, indexed: ids };
  for (const result of results) {
    if (result.isErr()) continue;
    const ws = result.value;
    index.names[ws.id] = { name: ws.name, urlKey: ws.urlKey };
    index.urlKeys[ws.urlKey] = ws.id;
    for (const key of ws.teamKeys) {
      const k = key.toUpperCase();
      index.teams[k] = [...(index.teams[k] ?? []), ws.id];
    }
  }
  return index;
}

/**
 * Cached index when it covers exactly the stored workspaces and answers the hint;
 * otherwise one fresh listing, written back to the cache.
 */
async function loadIndex(answers: (index: WorkspaceIndex) => boolean): Promise<WorkspaceIndex> {
  const sessions = await listWorkspaceCredentials();
  const ids = Object.keys(sessions).sort();
  const cached = await readIndex();
  if (cached && answers(cached) && [...cached.indexed].sort().join() === ids.join()) return cached;
  const fresh = await buildIndex(sessions);
  await ResultAsync.fromPromise(writeIndex(fresh), toError);
  return fresh;
}

function label(index: WorkspaceIndex, id: string): string {
  const known = index.names[id];
  return known ? `${known.name} (${known.urlKey}, ${id})` : id;
}

/** Stored workspace ids with names when the cache knows them; no network. */
export async function describeStoredWorkspaces(ids: string[]): Promise<string> {
  const cached = await readIndex();
  return ids.map((id) => (cached?.names[id] ? label(cached, id) : id)).join(', ');
}

function unmatched(what: string, index: WorkspaceIndex): ValidationError {
  const checked = index.indexed.filter((id) => index.names[id]);
  const failed = index.indexed.filter((id) => !index.names[id]);
  const checkedText = checked.map((id) => label(index, id)).join(', ') || 'none';
  const failedText = failed.length
    ? ` Could not check (login expired or unreachable): ${failed.join(', ')}.`
    : '';
  return new ValidationError(
    `${what} not found in any stored workspace. Checked: ${checkedText}.${failedText}`
  );
}

/** Workspace id for a team key or issue-URL hint; errors when none or several workspaces match. */
export function resolveHintWorkspaceId(hint: WorkspaceHint): ResultAsync<string, CliError> {
  return ResultAsync.fromPromise(
    loadIndex((i) => (hint.kind === 'team' ? hint.key in i.teams : hint.urlKey in i.urlKeys)),
    coerceCliError
  ).andThen((index) => {
    if (hint.kind === 'url') {
      const id = index.urlKeys[hint.urlKey];
      return id
        ? okAsync(id)
        : errAsync(unmatched(`Workspace '${hint.urlKey}' from the issue URL`, index));
    }
    const matches = index.teams[hint.key] ?? [];
    if (matches.length === 1) return okAsync(matches[0]);
    return errAsync(
      matches.length === 0
        ? unmatched(`Team key '${hint.key}'`, index)
        : new ValidationError(
            `Team key '${hint.key}' exists in multiple stored workspaces: ${matches.map((id) => label(index, id)).join(', ')}. ${HOW_TO_CHOOSE}`
          )
    );
  });
}
