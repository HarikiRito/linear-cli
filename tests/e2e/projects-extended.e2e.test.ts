/**
 * E2E tests: projects CRUD (create, get, update, labels) + negative cases.
 *
 * Created projects are tracked and cleaned up in afterAll via projects delete.
 *
 * Gate: RUN_E2E=1
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  CMD_TIMEOUT,
  discoverTeam,
  makeRegistry,
  parsePlainList,
  parsePlainRecord,
  RUN_E2E,
  runCLI,
  type TeamInfo,
  uniqueName,
} from './helpers.js';

describe.skipIf(!RUN_E2E)('projects extended E2E', () => {
  let team: TeamInfo;
  let projectId = '';
  let projectName = '';
  const reg = makeRegistry();

  beforeAll(async () => {
    team = await discoverTeam();
  }, CMD_TIMEOUT);

  // ── create ────────────────────────────────────────────────────────────────

  it(
    'projects create --plain returns project with id, name, state, url',
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
        '--plain',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(typeof data['id']).toBe('string');
      expect(data['id']).not.toBe('');
      expect(data['_primaryId']).toBe(projectName);  // name is primaryId
      expect(typeof data['state']).toBe('string');
      expect(data['url']).toContain('linear.app');

      projectId = data['id'] ?? '';
      reg.trackProject(projectId);
    },
    CMD_TIMEOUT
  );

  // ── get ───────────────────────────────────────────────────────────────────

  it(
    'projects get <id> --plain returns project details',
    async () => {
      expect(projectId, 'depends on create').not.toBe('');
      const r = await runCLI(['projects', 'get', projectId, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['_primaryId']).toBe(projectName);  // name
      expect(typeof data['state']).toBe('string');
      expect(data['url']).toContain('linear.app');
    },
    CMD_TIMEOUT
  );

  // ── update ────────────────────────────────────────────────────────────────

  it(
    'projects update <id> --name --plain reflects name change',
    async () => {
      expect(projectId, 'depends on create').not.toBe('');
      const newName = uniqueName('e2e-proj-updated');
      const r = await runCLI(['projects', 'update', projectId, '--name', newName, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['id']).toBe(projectId);
      expect(data['_primaryId']).toBe(newName);
      projectName = newName;
    },
    CMD_TIMEOUT
  );

  // ── labels ────────────────────────────────────────────────────────────────

  it(
    'projects labels --project <id> --plain exits 0 with labels array',
    async () => {
      expect(projectId, 'depends on create').not.toBe('');
      const r = await runCLI(['projects', 'labels', '--project', projectId, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
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
