/**
 * E2E tests: milestones CRUD (create, list, get, update, delete) + negative cases.
 *
 * A project is created in beforeAll to host the milestones.
 * The project is cleaned up in afterAll.
 *
 * Gate: RUN_E2E=1
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CMD_TIMEOUT,
  discoverTeam,
  parsePlainList,
  parsePlainRecord,
  RUN_E2E,
  runCLI,
  type TeamInfo,
  uniqueName,
} from './helpers.js';

describe.skipIf(!RUN_E2E)('milestones CRUD E2E', () => {
  let team: TeamInfo;
  let projectId = '';
  let milestoneId = '';
  let milestoneName = '';

  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    team = await discoverTeam();

    // Create a project to attach milestones to
    const projName = uniqueName('e2e-ms-proj');
    const r = await runCLI([
      'projects',
      'create',
      '--name',
      projName,
      '--team',
      team.name,
      '--plain',
    ]);
    if (r.code !== 0) {
      throw new Error(`Failed to create project for milestones E2E: ${r.stderr}`);
    }
    const data = parsePlainRecord(r.stdout);
    projectId = data['id'] ?? '';
    if (!projectId) throw new Error('No project id returned from create');
    createdProjectIds.push(projectId);
  }, CMD_TIMEOUT * 2);

  afterAll(async () => {
    // Best-effort: mark projects as cancelled
    for (const id of createdProjectIds) {
      try {
        await runCLI(['projects', 'update', id, '--state', 'cancelled']);
      } catch {
        /* best-effort */
      }
    }
  }, CMD_TIMEOUT * 3);

  // ── create ────────────────────────────────────────────────────────────────

  it(
    'milestones create --plain returns milestone with id, name',
    async () => {
      expect(projectId, 'project must be created').not.toBe('');
      milestoneName = uniqueName('e2e-milestone');
      const r = await runCLI([
        'milestones',
        'create',
        '--project',
        projectId,
        '--name',
        milestoneName,
        '--plain',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(typeof data['id']).toBe('string');
      expect(data['id']).not.toBe('');
      expect(data['_primaryId']).toBe(milestoneName);  // name is primaryId

      milestoneId = data['id'] ?? '';
    },
    CMD_TIMEOUT
  );

  // ── list ──────────────────────────────────────────────────────────────────

  it(
    'milestones list --project <id> --plain includes created milestone',
    async () => {
      expect(milestoneId, 'depends on create').not.toBe('');
      const r = await runCLI(['milestones', 'list', '--project', projectId, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
      const found = records.some((m) => m['_primaryId'] === milestoneName);
      expect(found, `milestone ${milestoneName} not found in list`).toBe(true);
    },
    CMD_TIMEOUT
  );

  // ── get ───────────────────────────────────────────────────────────────────

  it(
    'milestones get <id> --plain returns milestone details',
    async () => {
      expect(milestoneId, 'depends on create').not.toBe('');
      const r = await runCLI(['milestones', 'get', milestoneId, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['id']).toBe(milestoneId);
      expect(data['_primaryId']).toBe(milestoneName);
    },
    CMD_TIMEOUT
  );

  // ── update ────────────────────────────────────────────────────────────────

  it(
    'milestones update <id> --name --plain reflects name change',
    async () => {
      expect(milestoneId, 'depends on create').not.toBe('');
      const newName = uniqueName('e2e-ms-updated');
      const r = await runCLI([
        'milestones',
        'update',
        milestoneId,
        '--name',
        newName,
        '--plain',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['id']).toBe(milestoneId);
      expect(data['_primaryId']).toBe(newName);
      milestoneName = newName;
    },
    CMD_TIMEOUT
  );

  // ── negative ──────────────────────────────────────────────────────────────

  it(
    'milestones list without --project exits non-zero',
    async () => {
      const r = await runCLI(['milestones', 'list', '--plain']);
      expect(r.code).not.toBe(0);
    },
    CMD_TIMEOUT
  );

  it(
    'milestones create without --project exits non-zero',
    async () => {
      const r = await runCLI(['milestones', 'create', '--name', uniqueName('e2e-ms-noproject')]);
      expect(r.code).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/project|required|missing/i);
    },
    CMD_TIMEOUT
  );

  it(
    'milestones delete without --yes in non-TTY exits non-zero',
    async () => {
      expect(milestoneId, 'depends on create').not.toBe('');
      const r = await runCLI(['milestones', 'delete', milestoneId]);
      expect(r.code).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/--yes|non-interactively/i);
    },
    CMD_TIMEOUT
  );

  // ── delete ────────────────────────────────────────────────────────────────

  it(
    'milestones delete <id> --yes exits 0',
    async () => {
      expect(milestoneId, 'depends on create').not.toBe('');
      const r = await runCLI(['milestones', 'delete', milestoneId, '--yes']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      // milestoneId is now deleted — don't track for further cleanup
    },
    CMD_TIMEOUT
  );
});
