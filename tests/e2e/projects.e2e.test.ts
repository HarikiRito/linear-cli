/**
 * E2E tests: projects list
 *
 * Gate: RUN_E2E=1
 */

import { describe, expect, it } from 'vitest';
import { CMD_TIMEOUT, parsePlainList, RUN_E2E, runCLI } from './helpers.js';

describe.skipIf(!RUN_E2E)('projects E2E', () => {
  it(
    'projects list --plain exits 0 and returns projects array',
    async () => {
      const r = await runCLI(['projects', 'list', '--plain']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(Array.isArray(records)).toBe(true);
    },
    CMD_TIMEOUT
  );

  it(
    'projects list --limit 1 --plain returns at most 1 project',
    async () => {
      const r = await runCLI(['projects', 'list', '--limit', '1', '--plain']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(records.length).toBeLessThanOrEqual(1);
    },
    CMD_TIMEOUT
  );

  it(
    'projects list rows have name and state fields when present',
    async () => {
      const r = await runCLI(['projects', 'list', '--plain', '--limit', '10']);
      expect(r.code).toBe(0);
      const records = parsePlainList(r.stdout);
      for (const p of records) {
        expect(typeof p['_primaryId']).toBe('string');  // name
        expect(p['_primaryId']).not.toBe('');
        expect(typeof p['state']).toBe('string');
      }
    },
    CMD_TIMEOUT
  );
});
