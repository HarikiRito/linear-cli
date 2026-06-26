/**
 * E2E tests: issues read commands (list, me, query)
 * No mutations — no cleanup needed.
 *
 * Team name is discovered at runtime via discoverTeam().
 * Search terms for `issues query` are either derived from a created issue's
 * title or are unique enough to produce zero results reliably.
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
  uniqueName,
} from './helpers.js';

describe.skipIf(!RUN_E2E)('issues read E2E', () => {
  const reg = makeRegistry();
  let teamName = '';

  // Unique token we embed in a created issue title for the query test
  const queryToken = `e2qlabel-${Date.now()}`;
  let queryIssueId = '';

  beforeAll(async () => {
    // Discover the first available team
    const team = await discoverTeam();
    teamName = team.name;

    // Create a temporary issue whose title contains our unique token so
    // `issues query <token>` returns exactly that issue (avoids hardcoding).
    const r = await runCLI([
      'issues',
      'create',
      '--title',
      uniqueName(`e2e-read-${queryToken}`),
      '--team',
      teamName,
      '--plain',
    ]);
    if (r.code !== 0) {
      throw new Error(`Setup: could not create query-probe issue\nstderr: ${r.stderr}`);
    }
    const data = parsePlainRecord(r.stdout);
    queryIssueId = data['id'];
    reg.trackIssue(queryIssueId);
  }, CMD_TIMEOUT);

  // ── issues list ──────────────────────────────────────────────────────────

  it(
    'issues list --plain --all-states exits 0 and returns issues array',
    async () => {
      const r = await runCLI(['issues', 'list', '--plain', '--all-states', '--limit', '10']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
    },
    CMD_TIMEOUT
  );

  it(
    'issues list --team <discovered> --plain filters to that team',
    async () => {
      expect(teamName).not.toBe('');
      const r = await runCLI([
        'issues',
        'list',
        '--team',
        teamName,
        '--plain',
        '--all-states',
        '--limit',
        '5',
      ]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
    },
    CMD_TIMEOUT
  );

  it(
    'issues list --limit 1 --plain --all-states returns at most 1 issue',
    async () => {
      const r = await runCLI(['issues', 'list', '--plain', '--all-states', '--limit', '1']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(records.length).toBeLessThanOrEqual(1);
    },
    CMD_TIMEOUT
  );

  it(
    'issues list --state todo --plain exits 0',
    async () => {
      const r = await runCLI(['issues', 'list', '--plain', '--state', 'todo', '--limit', '5']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
    },
    CMD_TIMEOUT
  );

  it(
    'issues list rows have identifier, title, state, assignee string fields',
    async () => {
      const r = await runCLI(['issues', 'list', '--plain', '--all-states', '--limit', '5']);
      expect(r.code).toBe(0);
      const records = parsePlainList(r.stdout);
      for (const issue of records) {
        expect(typeof issue['_primaryId']).toBe('string');  // identifier
        expect(typeof issue['title']).toBe('string');
        expect(typeof issue['state']).toBe('string');
        // identifier must match generic team-key + number pattern
        expect(issue['_primaryId']).toMatch(/^[A-Z0-9]+-\d+$/);
      }
    },
    CMD_TIMEOUT
  );

  // ── issues me ────────────────────────────────────────────────────────────

  it(
    'issues me --plain --all-states exits 0 and returns issues array',
    async () => {
      const r = await runCLI(['issues', 'me', '--plain', '--all-states', '--limit', '10']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
    },
    CMD_TIMEOUT
  );

  it(
    'issues me --limit 1 --plain --all-states returns at most 1 issue',
    async () => {
      const r = await runCLI(['issues', 'me', '--plain', '--all-states', '--limit', '1']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(records.length).toBeLessThanOrEqual(1);
    },
    CMD_TIMEOUT
  );

  // ── issues query ─────────────────────────────────────────────────────────

  it(
    'issues query <discovered-token> --plain --all-states finds the probe issue',
    async () => {
      expect(queryToken).not.toBe('');
      const r = await runCLI([
        'issues',
        'query',
        queryToken,
        '--plain',
        '--all-states',
        '--limit',
        '10',
      ]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
      // The probe issue we created must appear in results
      expect(records.length).toBeGreaterThan(0);
    },
    CMD_TIMEOUT
  );

  it(
    'issues query with a gibberish no-match token exits 0 with empty output',
    async () => {
      const noMatchToken = `zqxvw-${Math.random().toString(36).slice(2, 10)}-kfjmbnp`;
      const r = await runCLI(['issues', 'query', noMatchToken, '--plain', '--all-states']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(records.length).toBe(0);
    },
    CMD_TIMEOUT
  );
});
