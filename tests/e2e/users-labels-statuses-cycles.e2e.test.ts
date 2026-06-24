/**
 * E2E tests: users, labels, statuses, cycles — read-only.
 *
 * Gate: RUN_E2E=1
 *
 * No values are hardcoded — team name is discovered at runtime via discoverTeam().
 * Viewer ID is discovered via getViewer().
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  CMD_TIMEOUT,
  discoverTeam,
  getViewer,
  RUN_E2E,
  runCLI,
  type TeamInfo,
  type ViewerInfo,
} from './helpers.js';

describe.skipIf(!RUN_E2E)('users/labels/statuses/cycles read-only E2E', () => {
  let team: TeamInfo;
  let viewer: ViewerInfo;

  beforeAll(async () => {
    team = await discoverTeam();
    viewer = await getViewer();
  }, CMD_TIMEOUT);

  // ── users ─────────────────────────────────────────────────────────────────

  it(
    'users list --json exits 0 and returns users array with pageInfo',
    async () => {
      const r = await runCLI(['users', 'list', '--json']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const data = r.json as {
        users?: { id: string; name: string; email: string; active: boolean }[];
        pageInfo?: { hasNextPage: boolean; endCursor: string | null };
      };
      expect(Array.isArray(data?.users)).toBe(true);
      expect(data.pageInfo).toBeDefined();
      expect(typeof data.pageInfo?.hasNextPage).toBe('boolean');
    },
    CMD_TIMEOUT
  );

  it(
    'users list --limit 1 --json returns at most 1 user',
    async () => {
      const r = await runCLI(['users', 'list', '--limit', '1', '--json']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const data = r.json as { users: unknown[] };
      expect(data.users.length).toBeLessThanOrEqual(1);
    },
    CMD_TIMEOUT
  );

  it(
    'users get <viewer-id> --json returns user fields',
    async () => {
      expect(viewer.id, 'viewer must be discovered').not.toBe('');
      const r = await runCLI(['users', 'get', viewer.id, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as { user?: { id: string; name: string; email: string } };
      expect(data?.user).toBeDefined();
      expect(data.user?.id).toBe(viewer.id);
      expect(typeof data.user?.name).toBe('string');
      expect(typeof data.user?.email).toBe('string');
    },
    CMD_TIMEOUT
  );

  // ── labels ────────────────────────────────────────────────────────────────

  it(
    'labels list --json exits 0 and returns labels array',
    async () => {
      const r = await runCLI(['labels', 'list', '--json']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const data = r.json as { labels?: unknown[]; pageInfo?: { hasNextPage: boolean } };
      expect(Array.isArray(data?.labels)).toBe(true);
      expect(data.pageInfo).toBeDefined();
    },
    CMD_TIMEOUT
  );

  it(
    'labels list --team <team> --json scopes to team',
    async () => {
      expect(team.name, 'team must be discovered').not.toBe('');
      const r = await runCLI(['labels', 'list', '--team', team.name, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as { labels?: unknown[] };
      expect(Array.isArray(data?.labels)).toBe(true);
    },
    CMD_TIMEOUT
  );

  // ── statuses ──────────────────────────────────────────────────────────────

  it(
    'statuses list --team <team> --json exits 0 with non-empty statuses',
    async () => {
      expect(team.name, 'team must be discovered').not.toBe('');
      const r = await runCLI(['statuses', 'list', '--team', team.name, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as {
        statuses?: { id: string; name: string; type: string; color: string; position: number }[];
      };
      expect(Array.isArray(data?.statuses)).toBe(true);
      expect(data.statuses?.length).toBeGreaterThan(0);
      // Each status should have required fields
      const s = data.statuses?.[0];
      expect(typeof s?.id).toBe('string');
      expect(typeof s?.name).toBe('string');
      expect(typeof s?.type).toBe('string');
    },
    CMD_TIMEOUT
  );

  it(
    'statuses list without --team exits non-zero',
    async () => {
      const r = await runCLI(['statuses', 'list', '--json']);
      expect(r.code).not.toBe(0);
    },
    CMD_TIMEOUT
  );

  // ── cycles ────────────────────────────────────────────────────────────────

  it(
    'cycles list --team <team> --json exits 0 and returns cycles array',
    async () => {
      expect(team.name, 'team must be discovered').not.toBe('');
      const r = await runCLI(['cycles', 'list', '--team', team.name, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as { cycles?: unknown[]; pageInfo?: { hasNextPage: boolean } };
      expect(Array.isArray(data?.cycles)).toBe(true);
      expect(data.pageInfo).toBeDefined();
    },
    CMD_TIMEOUT
  );

  it(
    'cycles list without --team exits non-zero',
    async () => {
      const r = await runCLI(['cycles', 'list', '--json']);
      expect(r.code).not.toBe(0);
    },
    CMD_TIMEOUT
  );
});
