/**
 * E2E tests: issues CRUD (create, update, delete) + negative cases.
 * All created issues are tracked and deleted in afterAll.
 *
 * Team name is discovered at runtime via discoverTeam().
 * Issue identifier pattern is asserted generically (/^[A-Z0-9]+-\d+$/).
 *
 * Gate: RUN_E2E=1
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  CMD_TIMEOUT,
  discoverTeam,
  makeRegistry,
  parsePlainRecord,
  RUN_E2E,
  runCLI,
  uniqueName,
} from './helpers.js';

describe.skipIf(!RUN_E2E)('issues CRUD E2E', () => {
  const reg = makeRegistry();
  const createTitle = uniqueName('e2e-issue');
  const updatedTitle = uniqueName('e2e-issue-updated');

  let teamName = '';
  let issueId = '';
  let issueIdentifier = '';

  beforeAll(async () => {
    const team = await discoverTeam();
    teamName = team.name;
  }, CMD_TIMEOUT);

  // ── create ───────────────────────────────────────────────────────────────

  it(
    'issues create --plain returns issue with id, identifier, url, title',
    async () => {
      expect(teamName, 'team must be discovered').not.toBe('');
      const r = await runCLI([
        'issues',
        'create',
        '--title',
        createTitle,
        '--team',
        teamName,
        '--description',
        `E2E test created at ${new Date().toISOString()}`,
        '--priority',
        '3',
        '--plain',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['id']).toBeTruthy();
      // identifier matches generic pattern — no team key hardcoded
      expect(data['_primaryId']).toMatch(/^[A-Z0-9]+-\d+$/);
      expect(data['title']).toBe(createTitle);
      expect(data['url']).toContain('linear.app');
      expect(typeof data['state']).toBe('string');

      issueId = data['id'];
      issueIdentifier = data['_primaryId'];
      reg.trackIssue(issueId);
    },
    CMD_TIMEOUT
  );

  // ── update ───────────────────────────────────────────────────────────────

  it(
    'issues update --title --priority --plain reflects changes',
    async () => {
      expect(issueId, 'depends on create').not.toBe('');

      const r = await runCLI([
        'issues',
        'update',
        issueId,
        '--title',
        updatedTitle,
        '--priority',
        '2',
        '--plain',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['id']).toBe(issueId);
      expect(data['title']).toBe(updatedTitle);
    },
    CMD_TIMEOUT
  );

  it(
    'issues update by identifier (e.g. KEY-N, discovered at runtime) also works',
    async () => {
      expect(issueIdentifier, 'depends on create').not.toBe('');

      const newTitle = uniqueName('e2e-by-identifier');
      const r = await runCLI([
        'issues',
        'update',
        issueIdentifier,
        '--title',
        newTitle,
        '--plain',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['title']).toBe(newTitle);
    },
    CMD_TIMEOUT
  );

  // ── negative / agent-first ───────────────────────────────────────────────

  it(
    'issues create without --team exits non-zero with error about required option',
    async () => {
      const r = await runCLI(['issues', 'create', '--title', 'no-team-e2e']);
      expect(r.code).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/team|required|missing/i);
    },
    CMD_TIMEOUT
  );

  it(
    'issues create without --title exits non-zero',
    async () => {
      expect(teamName).not.toBe('');
      const r = await runCLI(['issues', 'create', '--team', teamName]);
      expect(r.code).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/title|required|missing/i);
    },
    CMD_TIMEOUT
  );

  it(
    'issues create --priority 9 exits non-zero (out of range)',
    async () => {
      expect(teamName).not.toBe('');
      const r = await runCLI([
        'issues',
        'create',
        '--title',
        uniqueName('e2e-bad-priority'),
        '--team',
        teamName,
        '--priority',
        '9',
      ]);
      expect(r.code).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/priority/i);
    },
    CMD_TIMEOUT
  );

  it(
    'issues create --priority -1 exits non-zero (out of range)',
    async () => {
      expect(teamName).not.toBe('');
      const r = await runCLI([
        'issues',
        'create',
        '--title',
        uniqueName('e2e-bad-priority-neg'),
        '--team',
        teamName,
        '--priority',
        '-1',
      ]);
      expect(r.code).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/priority/i);
    },
    CMD_TIMEOUT
  );

  it(
    'issues create --team nonexistent exits non-zero with not-found error',
    async () => {
      const r = await runCLI([
        'issues',
        'create',
        '--title',
        uniqueName('e2e-bad-team'),
        '--team',
        `xyzzy-nonexistent-team-${Date.now()}`,
      ]);
      expect(r.code).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/not found|team/i);
    },
    CMD_TIMEOUT
  );

  it(
    'issues delete without --yes in non-TTY exits non-zero; issue still exists after',
    async () => {
      expect(issueId, 'depends on create').not.toBe('');

      const r = await runCLI(['issues', 'delete', issueId]);
      expect(r.code).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/--yes|non-interactively/i);

      // Issue must still exist — verify by listing its comments (errors if issue deleted)
      const listR = await runCLI(['issues', 'comment', 'list', issueId, '--plain']);
      expect(listR.code, 'issue should still exist after aborted delete').toBe(0);
    },
    CMD_TIMEOUT
  );

  // ── delete ───────────────────────────────────────────────────────────────

  it(
    'issues delete --yes exits 0',
    async () => {
      expect(issueId, 'depends on create').not.toBe('');

      const r = await runCLI(['issues', 'delete', issueId, '--yes']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      // afterAll will attempt deletion again — that's fine, it's best-effort
    },
    CMD_TIMEOUT
  );
});
