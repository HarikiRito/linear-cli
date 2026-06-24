/**
 * E2E tests: teams list
 *
 * No team name/key/id is hardcoded — we verify shape and that at least one
 * team is returned. The first team discovered is re-verified for consistency.
 *
 * Gate: RUN_E2E=1
 */

import { describe, it, expect } from 'vitest';
import { RUN_E2E, CMD_TIMEOUT, runCLI } from './helpers.js';

describe.skipIf(!RUN_E2E)('teams E2E', () => {
  it('teams list --json exits 0 and returns at least one team with id/name/key', async () => {
    const r = await runCLI(['teams', 'list', '--json']);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as {
      teams?: Array<{ id: string; name: string; key: string }>;
      pageInfo?: { hasNextPage: boolean; endCursor: string | null };
    };
    expect(Array.isArray(data?.teams)).toBe(true);
    expect(data.teams!.length).toBeGreaterThan(0);
    const t = data.teams![0];
    expect(typeof t.id).toBe('string');
    expect(t.id).not.toBe('');
    expect(typeof t.name).toBe('string');
    expect(t.name).not.toBe('');
    expect(typeof t.key).toBe('string');
    expect(t.key).not.toBe('');
    expect(data.pageInfo).toBeDefined();
    expect(typeof data.pageInfo!.hasNextPage).toBe('boolean');
  }, CMD_TIMEOUT);

  it('teams list --limit 1 --json returns at most 1 team', async () => {
    const r = await runCLI(['teams', 'list', '--limit', '1', '--json']);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as { teams: unknown[] };
    expect(data.teams.length).toBeLessThanOrEqual(1);
  }, CMD_TIMEOUT);

  it('teams list --all --json returns same first team as single-page call', async () => {
    const r1 = await runCLI(['teams', 'list', '--json', '--limit', '1']);
    const r2 = await runCLI(['teams', 'list', '--json', '--all']);
    expect(r1.code).toBe(0);
    expect(r2.code).toBe(0);
    const d1 = r1.json as { teams: Array<{ id: string }> };
    const d2 = r2.json as { teams: Array<{ id: string }> };
    // First team id must be consistent across calls
    expect(d1.teams[0].id).toBe(d2.teams[0].id);
  }, CMD_TIMEOUT);
});
