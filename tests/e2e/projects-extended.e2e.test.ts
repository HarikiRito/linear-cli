/**
 * E2E tests: projects CRUD (create, get, update, labels) + negative cases.
 *
 * Created projects are tracked and cleaned up in afterAll via projects update
 * (there is no projects delete command yet, so cleanup is best-effort).
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

describe.skipIf(!RUN_E2E)('projects extended E2E', () => {
  let team: TeamInfo;
  let projectId = '';
  let projectName = '';
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    team = await discoverTeam();
  }, CMD_TIMEOUT);

  afterAll(async () => {
    // Best-effort: mark created projects as cancelled so they don't pollute the workspace
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
    'projects create --json returns project with id, name, state, url',
    async () => {
      expect(team.name, 'team must be discovered').not.toBe('');
      projectName = uniqueName('e2e-proj');
      const r = await runCLI([
        'projects',
        'create',
        '--name',
        projectName,
        '--team',
        team.name,
        '--json',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as { project?: { id: string; name: string; state: string; url: string } };
      expect(data?.project).toBeDefined();
      expect(typeof data.project?.id).toBe('string');
      expect(data.project?.id).not.toBe('');
      expect(data.project?.name).toBe(projectName);
      expect(typeof data.project?.state).toBe('string');
      expect(data.project?.url).toContain('linear.app');

      projectId = data.project?.id ?? '';
      createdProjectIds.push(projectId);
    },
    CMD_TIMEOUT
  );

  // ── get ───────────────────────────────────────────────────────────────────

  it(
    'projects get <id> --json returns project details',
    async () => {
      expect(projectId, 'depends on create').not.toBe('');
      const r = await runCLI(['projects', 'get', projectId, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as {
        project?: {
          id: string;
          name: string;
          description: string;
          state: string;
          url: string;
          teams: { id: string; name: string }[];
          members: { id: string }[];
        };
      };
      expect(data?.project).toBeDefined();
      expect(data.project?.id).toBe(projectId);
      expect(data.project?.name).toBe(projectName);
      expect(typeof data.project?.state).toBe('string');
      expect(data.project?.url).toContain('linear.app');
      expect(Array.isArray(data.project?.teams)).toBe(true);
      expect(Array.isArray(data.project?.members)).toBe(true);
    },
    CMD_TIMEOUT
  );

  // ── update ────────────────────────────────────────────────────────────────

  it(
    'projects update <id> --name --json reflects name change',
    async () => {
      expect(projectId, 'depends on create').not.toBe('');
      const newName = uniqueName('e2e-proj-updated');
      const r = await runCLI(['projects', 'update', projectId, '--name', newName, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as { project?: { id: string; name: string } };
      expect(data?.project).toBeDefined();
      expect(data.project?.id).toBe(projectId);
      expect(data.project?.name).toBe(newName);
      // update projectName so subsequent tests use new name
      projectName = newName;
    },
    CMD_TIMEOUT
  );

  // ── labels ────────────────────────────────────────────────────────────────

  it(
    'projects labels --project <id> --json exits 0 with labels array',
    async () => {
      expect(projectId, 'depends on create').not.toBe('');
      const r = await runCLI(['projects', 'labels', '--project', projectId, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as { labels?: unknown[] };
      expect(Array.isArray(data?.labels)).toBe(true);
    },
    CMD_TIMEOUT
  );

  // ── negative ──────────────────────────────────────────────────────────────

  it(
    'projects create without --team exits non-zero',
    async () => {
      const r = await runCLI(['projects', 'create', '--name', uniqueName('e2e-no-team')]);
      expect(r.code).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/team|required|missing/i);
    },
    CMD_TIMEOUT
  );
});
