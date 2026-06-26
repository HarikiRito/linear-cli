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
  parsePlainList,
  parsePlainRecord,
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
    'users list --plain exits 0 and returns users array',
    async () => {
      const r = await runCLI(['users', 'list', '--plain']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBeGreaterThan(0);
    },
    CMD_TIMEOUT
  );

  it(
    'users list --limit 1 --plain returns at most 1 user',
    async () => {
      const r = await runCLI(['users', 'list', '--limit', '1', '--plain']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(records.length).toBeLessThanOrEqual(1);
    },
    CMD_TIMEOUT
  );

  it(
    'users get <viewer-id> --plain returns user fields',
    async () => {
      expect(viewer.id, 'viewer must be discovered').not.toBe('');
      const r = await runCLI(['users', 'get', viewer.id, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['_primaryId']).toBe(viewer.name);
      expect(data['email']).toBe(viewer.email);
    },
    CMD_TIMEOUT
  );

  // ── labels ────────────────────────────────────────────────────────────────

  it(
    'labels list --plain exits 0 and returns labels array',
    async () => {
      const r = await runCLI(['labels', 'list', '--plain']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
    },
    CMD_TIMEOUT
  );

  it(
    'labels list --team <team> --plain scopes to team',
    async () => {
      expect(team.name, 'team must be discovered').not.toBe('');
      const r = await runCLI(['labels', 'list', '--team', team.name, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
    },
    CMD_TIMEOUT
  );

  // ── statuses ──────────────────────────────────────────────────────────────

  it(
    'statuses list --team <team> --plain exits 0 with non-empty statuses',
    async () => {
      expect(team.name, 'team must be discovered').not.toBe('');
      const r = await runCLI(['statuses', 'list', '--team', team.name, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBeGreaterThan(0);
      // Each status should have required fields
      const s = records[0];
      expect(typeof s['_primaryId']).toBe('string');  // name
      expect(typeof s['type']).toBe('string');
    },
    CMD_TIMEOUT
  );

  it(
    'statuses list without --team exits non-zero',
    async () => {
      const r = await runCLI(['statuses', 'list', '--plain']);
      expect(r.code).not.toBe(0);
    },
    CMD_TIMEOUT
  );

  // ── cycles ────────────────────────────────────────────────────────────────

  it(
    'cycles list --team <team> --plain exits 0 and returns cycles array',
    async () => {
      expect(team.name, 'team must be discovered').not.toBe('');
      const r = await runCLI(['cycles', 'list', '--team', team.name, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
    },
    CMD_TIMEOUT
  );

  it(
    'cycles list without --team exits non-zero',
    async () => {
      const r = await runCLI(['cycles', 'list', '--plain']);
      expect(r.code).not.toBe(0);
    },
    CMD_TIMEOUT
  );
});
