/**
 * E2E tests: teams list
 *
 * No team name/key/id is hardcoded — we verify shape and that at least one
 * team is returned. The first team discovered is re-verified for consistency.
 *
 * Gate: RUN_E2E=1
 */

import { describe, expect, it } from 'vitest';
import { CMD_TIMEOUT, parsePlainList, RUN_E2E, runCLI } from './helpers.js';

describe.skipIf(!RUN_E2E)('teams E2E', () => {
  it(
    'teams list --plain exits 0 and returns at least one team with id/name/key',
    async () => {
      const r = await runCLI(['teams', 'list', '--plain']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(records.length).toBeGreaterThan(0);
      const t = records[0];
      expect(typeof t['id']).toBe('string');
      expect(t['id']).not.toBe('');
      expect(typeof t['_primaryId']).toBe('string');  // name
      expect(t['_primaryId']).not.toBe('');
      expect(typeof t['key']).toBe('string');
      expect(t['key']).not.toBe('');
    },
    CMD_TIMEOUT
  );

  it(
    'teams list --limit 1 --plain returns at most 1 team',
    async () => {
      const r = await runCLI(['teams', 'list', '--limit', '1', '--plain']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(records.length).toBeLessThanOrEqual(1);
    },
    CMD_TIMEOUT
  );

  it(
    'teams list --all --plain returns same first team as single-page call',
    async () => {
      const r1 = await runCLI(['teams', 'list', '--plain', '--limit', '1']);
      const r2 = await runCLI(['teams', 'list', '--plain', '--all']);
      expect(r1.code).toBe(0);
      expect(r2.code).toBe(0);
      const d1 = parsePlainList(r1.stdout);
      const d2 = parsePlainList(r2.stdout);
      // First team id must be consistent across calls
      expect(d1[0]['id']).toBe(d2[0]['id']);
    },
    CMD_TIMEOUT
  );
});
