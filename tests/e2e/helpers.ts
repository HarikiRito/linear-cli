/**
 * Shared helpers for all E2E test suites.
 *
 * All workspace-specific values (team name, viewer identity, etc.) are
 * discovered at runtime from the CLI — nothing is hardcoded.
 *
 * Gate: set RUN_E2E=1 to run; normal `pnpm test` skips all suites.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll } from 'vitest';

const execFileAsync = promisify(execFile);

export const CLI = '/home/h/code/linear-cli/dist/index.cjs';
export const RUN_E2E = process.env.RUN_E2E === '1';

/** Per-command network timeout (ms). */
export const CMD_TIMEOUT = 30_000;

// ── Result type ──────────────────────────────────────────────────────────────

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
  json?: unknown;
}

// ── CLI runner ───────────────────────────────────────────────────────────────

/**
 * Run the built CLI binary with the given args.
 * Never passes --api-key / --token; relies on the stored session.
 */
export async function runCLI(args: string[]): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI, ...args], {
      timeout: CMD_TIMEOUT,
    });
    return { stdout, stderr, code: 0, json: tryParseJson(stdout) };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    const stdout = e.stdout ?? '';
    const stderr = e.stderr ?? '';
    const code = typeof e.code === 'number' ? e.code : 1;
    return { stdout, stderr, code, json: tryParseJson(stdout) };
  }
}

function tryParseJson(text: string): unknown {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.parse(t);
    } catch {
      // not JSON
    }
  }
  return undefined;
}

// ── Unique name generator ────────────────────────────────────────────────────

let _seq = 0;
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_seq}`;
}

// ── Runtime discovery ────────────────────────────────────────────────────────

export interface TeamInfo {
  id: string;
  name: string;
  key: string;
}

export interface ViewerInfo {
  id: string;
  name: string;
  email: string;
  workspace: string;
}

/**
 * Discover the first available team by calling `teams list --json`.
 * Throws if the CLI call fails or returns no teams.
 */
export async function discoverTeam(): Promise<TeamInfo> {
  const r = await runCLI(['teams', 'list', '--json']);
  if (r.code !== 0) {
    throw new Error(`teams list failed (exit ${r.code}): ${r.stderr}`);
  }
  const data = r.json as { teams?: TeamInfo[] };
  if (!data?.teams?.length) {
    throw new Error('teams list returned no teams — cannot run E2E tests');
  }
  return data.teams[0];
}

/**
 * Get the currently-authenticated viewer via `whoami --json`.
 * Throws if not authenticated.
 */
export async function getViewer(): Promise<ViewerInfo> {
  const r = await runCLI(['whoami', '--json']);
  if (r.code !== 0) {
    throw new Error(`whoami failed (exit ${r.code}): ${r.stderr}`);
  }
  const data = r.json as ViewerInfo;
  if (!data?.id) {
    throw new Error('whoami returned no id — not authenticated?');
  }
  return data;
}

// ── Cleanup registry ─────────────────────────────────────────────────────────

export interface CleanupRegistry {
  trackIssue(id: string): void;
  trackComment(id: string): void;
}

/**
 * Returns a registry whose afterAll hook trashes all tracked IDs.
 * Call makeRegistry() at the top of each describe block.
 */
export function makeRegistry(): CleanupRegistry {
  const issueIds: string[] = [];
  const commentIds: string[] = [];

  afterAll(async () => {
    for (const id of [...commentIds]) {
      try { await runCLI(['issues', 'comment', 'delete', id, '--yes']); } catch { /* best-effort */ }
    }
    for (const id of [...issueIds]) {
      try { await runCLI(['issues', 'delete', id, '--yes']); } catch { /* best-effort */ }
    }
  }, CMD_TIMEOUT * 3);

  return {
    trackIssue(id: string) { issueIds.push(id); },
    trackComment(id: string) { commentIds.push(id); },
  };
}
