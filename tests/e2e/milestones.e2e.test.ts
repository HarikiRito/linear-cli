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
      '--json',
    ]);
    if (r.code !== 0) {
      throw new Error(`Failed to create project for milestones E2E: ${r.stderr}`);
    }
    const data = r.json as { project?: { id: string } };
    projectId = data.project?.id ?? '';
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
    'milestones create --json returns milestone with id, name',
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
        '--json',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as { milestone?: { id: string; name: string; project?: { id: string } } };
      expect(data?.milestone).toBeDefined();
      expect(typeof data.milestone?.id).toBe('string');
      expect(data.milestone?.id).not.toBe('');
      expect(data.milestone?.name).toBe(milestoneName);

      milestoneId = data.milestone?.id ?? '';
    },
    CMD_TIMEOUT
  );

  // ── list ──────────────────────────────────────────────────────────────────

  it(
    'milestones list --project <id> --json includes created milestone',
    async () => {
      expect(milestoneId, 'depends on create').not.toBe('');
      const r = await runCLI(['milestones', 'list', '--project', projectId, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as { milestones?: { id: string }[] };
      expect(Array.isArray(data?.milestones)).toBe(true);
      const found = data.milestones?.some((m) => m.id === milestoneId);
      expect(found, `milestone ${milestoneId} not found in list`).toBe(true);
    },
    CMD_TIMEOUT
  );

  // ── get ───────────────────────────────────────────────────────────────────

  it(
    'milestones get <id> --json returns milestone details',
    async () => {
      expect(milestoneId, 'depends on create').not.toBe('');
      const r = await runCLI(['milestones', 'get', milestoneId, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as {
        milestone?: {
          id: string;
          name: string;
          targetDate: string | null;
          description: string | null;
          progress: number;
          sortOrder: number;
          project?: { id: string };
        };
      };
      expect(data?.milestone).toBeDefined();
      expect(data.milestone?.id).toBe(milestoneId);
      expect(data.milestone?.name).toBe(milestoneName);
      expect(data.milestone?.project?.id).toBe(projectId);
    },
    CMD_TIMEOUT
  );

  // ── update ────────────────────────────────────────────────────────────────

  it(
    'milestones update <id> --name --json reflects name change',
    async () => {
      expect(milestoneId, 'depends on create').not.toBe('');
      const newName = uniqueName('e2e-ms-updated');
      const r = await runCLI(['milestones', 'update', milestoneId, '--name', newName, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as { milestone?: { id: string; name: string } };
      expect(data?.milestone).toBeDefined();
      expect(data.milestone?.id).toBe(milestoneId);
      expect(data.milestone?.name).toBe(newName);
      milestoneName = newName;
    },
    CMD_TIMEOUT
  );

  // ── negative ──────────────────────────────────────────────────────────────

  it(
    'milestones list without --project exits non-zero',
    async () => {
      const r = await runCLI(['milestones', 'list', '--json']);
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
