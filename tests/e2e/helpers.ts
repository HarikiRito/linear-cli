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
    return { stdout, stderr, code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    const stdout = e.stdout ?? '';
    const stderr = e.stderr ?? '';
    const code = typeof e.code === 'number' ? e.code : 1;
    return { stdout, stderr, code };
  }
}

// ── Plain-text output parsers ────────────────────────────────────────────────

/**
 * Parse a single plain-format record (key:value block with a header line).
 * The header line "Type: primaryId" populates _type and _primaryId.
 * Multi-line |<< block content is joined into a single multi-line string.
 * Returns a flat Record<string, string>.
 */
export function parsePlainRecord(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.trim().split('\n');
  if (lines.length === 0) return result;

  // Header: "Type: primaryId"
  const header = lines[0].match(/^(\w+):\s*(.+)$/);
  if (header) {
    result['_type'] = header[1];
    result['_primaryId'] = header[2];
  }

  for (let i = 1; i < lines.length; i++) {
    const kv = lines[i].match(/^([^:]+):\s*(.*)$/);
    if (kv) {
      const key = kv[1].trim();
      if (kv[2] === '|<<') {
        // Multi-line block — collect until <<END
        const blockLines: string[] = [];
        i++;
        while (i < lines.length && lines[i] !== '<<END') {
          blockLines.push(lines[i]);
          i++;
        }
        result[key] = blockLines.join('\n');
      } else {
        result[key] = kv[2];
      }
    }
  }
  return result;
}

/**
 * Parse a plain-format list (records separated by '\n---\n').
 * Returns an array of parsed records.
 */
export function parsePlainList(text: string): Record<string, string>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split('\n---\n').map(parsePlainRecord);
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
 * Discover the first available team by calling `teams list --plain`.
 * Throws if the CLI call fails or returns no teams.
 */
export async function discoverTeam(): Promise<TeamInfo> {
  const r = await runCLI(['teams', 'list', '--plain']);
  if (r.code !== 0) {
    throw new Error(`teams list failed (exit ${r.code}): ${r.stderr}`);
  }
  const records = parsePlainList(r.stdout);
  if (!records.length || !records[0]['_primaryId']) {
    throw new Error('teams list returned no teams — cannot run E2E tests');
  }
  const t = records[0];
  return {
    id: t['id'] ?? '',
    name: t['_primaryId'] ?? '',
    key: t['key'] ?? '',
  };
}

/**
 * Get the currently-authenticated viewer via `whoami --plain`.
 * Throws if not authenticated.
 */
export async function getViewer(): Promise<ViewerInfo> {
  const r = await runCLI(['whoami', '--plain']);
  if (r.code !== 0) {
    throw new Error(`whoami failed (exit ${r.code}): ${r.stderr}`);
  }
  const data = parsePlainRecord(r.stdout);
  if (!data['id']) {
    throw new Error('whoami returned no id — not authenticated?');
  }
  return {
    id: data['id'],
    name: data['_primaryId'] ?? '',
    email: data['email'] ?? '',
    workspace: data['workspace'] ?? '',
  };
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
      try {
        await runCLI(['issues', 'comment', 'delete', id, '--yes']);
      } catch {
        /* best-effort */
      }
    }
    for (const id of [...issueIds]) {
      try {
        await runCLI(['issues', 'delete', id, '--yes']);
      } catch {
        /* best-effort */
      }
    }
  }, CMD_TIMEOUT * 3);

  return {
    trackIssue(id: string) {
      issueIds.push(id);
    },
    trackComment(id: string) {
      commentIds.push(id);
    },
  };
}
