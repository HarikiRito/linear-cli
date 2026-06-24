/**
 * E2E tests: projects list
 *
 * Gate: RUN_E2E=1
 */

import { describe, it, expect } from 'vitest';
import { RUN_E2E, CMD_TIMEOUT, runCLI } from './helpers.js';

describe.skipIf(!RUN_E2E)('projects E2E', () => {
  it('projects list --json exits 0 and returns projects array with pageInfo', async () => {
    const r = await runCLI(['projects', 'list', '--json']);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as {
      projects?: Array<{ id: string; name: string; state: string }>;
      pageInfo?: { hasNextPage: boolean; endCursor: string | null };
    };
    expect(Array.isArray(data?.projects)).toBe(true);
    expect(data.pageInfo).toBeDefined();
    expect(typeof data.pageInfo!.hasNextPage).toBe('boolean');
  }, CMD_TIMEOUT);

  it('projects list --limit 1 --json returns at most 1 project', async () => {
    const r = await runCLI(['projects', 'list', '--limit', '1', '--json']);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as { projects: unknown[] };
    expect(data.projects.length).toBeLessThanOrEqual(1);
  }, CMD_TIMEOUT);

  it('projects list rows have id, name, state fields when present', async () => {
    const r = await runCLI(['projects', 'list', '--json', '--limit', '10']);
    expect(r.code).toBe(0);
    const data = r.json as { projects: Array<{ id: string; name: string; state: string }> };
    for (const p of data.projects) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.state).toBe('string');
    }
  }, CMD_TIMEOUT);
});
