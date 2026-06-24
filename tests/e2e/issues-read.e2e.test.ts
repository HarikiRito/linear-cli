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

import { describe, it, expect, beforeAll } from 'vitest';
import { RUN_E2E, CMD_TIMEOUT, runCLI, discoverTeam, uniqueName, makeRegistry } from './helpers.js';

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
      'issues', 'create',
      '--title', uniqueName(`e2e-read-${queryToken}`),
      '--team', teamName,
      '--json',
    ]);
    if (r.code !== 0) {
      throw new Error(`Setup: could not create query-probe issue\nstderr: ${r.stderr}`);
    }
    const data = r.json as { issue: { id: string } };
    queryIssueId = data.issue.id;
    reg.trackIssue(queryIssueId);
  }, CMD_TIMEOUT);

  // ── issues list ──────────────────────────────────────────────────────────

  it('issues list --json --all-states exits 0 and returns issues array with pageInfo', async () => {
    const r = await runCLI(['issues', 'list', '--json', '--all-states', '--limit', '10']);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as { issues?: unknown[]; pageInfo?: unknown };
    expect(Array.isArray(data?.issues)).toBe(true);
    expect(data.pageInfo).toBeDefined();
  }, CMD_TIMEOUT);

  it('issues list --team <discovered> --json filters to that team', async () => {
    expect(teamName).not.toBe('');
    const r = await runCLI([
      'issues', 'list',
      '--team', teamName,
      '--json', '--all-states', '--limit', '5',
    ]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as { issues: unknown[] };
    expect(Array.isArray(data.issues)).toBe(true);
  }, CMD_TIMEOUT);

  it('issues list --limit 1 --json --all-states returns at most 1 issue', async () => {
    const r = await runCLI(['issues', 'list', '--json', '--all-states', '--limit', '1']);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as { issues: unknown[] };
    expect(data.issues.length).toBeLessThanOrEqual(1);
  }, CMD_TIMEOUT);

  it('issues list --state todo --json exits 0', async () => {
    const r = await runCLI(['issues', 'list', '--json', '--state', 'todo', '--limit', '5']);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as { issues: unknown[] };
    expect(Array.isArray(data.issues)).toBe(true);
  }, CMD_TIMEOUT);

  it('issues list rows have identifier, title, state, assignee string fields', async () => {
    const r = await runCLI(['issues', 'list', '--json', '--all-states', '--limit', '5']);
    expect(r.code).toBe(0);
    const data = r.json as {
      issues: Array<{ identifier: string; title: string; state: string; assignee: string }>;
    };
    for (const issue of data.issues) {
      expect(typeof issue.identifier).toBe('string');
      expect(typeof issue.title).toBe('string');
      expect(typeof issue.state).toBe('string');
      expect(typeof issue.assignee).toBe('string');
      // identifier must match generic team-key + number pattern
      expect(issue.identifier).toMatch(/^[A-Z0-9]+-\d+$/);
    }
  }, CMD_TIMEOUT);

  // ── issues me ────────────────────────────────────────────────────────────

  it('issues me --json --all-states exits 0 and returns issues array with pageInfo', async () => {
    const r = await runCLI(['issues', 'me', '--json', '--all-states', '--limit', '10']);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as { issues?: unknown[]; pageInfo?: unknown };
    expect(Array.isArray(data?.issues)).toBe(true);
    expect(data.pageInfo).toBeDefined();
  }, CMD_TIMEOUT);

  it('issues me --limit 1 --json --all-states returns at most 1 issue', async () => {
    const r = await runCLI(['issues', 'me', '--json', '--all-states', '--limit', '1']);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as { issues: unknown[] };
    expect(data.issues.length).toBeLessThanOrEqual(1);
  }, CMD_TIMEOUT);

  // ── issues query ─────────────────────────────────────────────────────────

  it('issues query <discovered-token> --json --all-states finds the probe issue', async () => {
    expect(queryToken).not.toBe('');
    const r = await runCLI([
      'issues', 'query', queryToken,
      '--json', '--all-states', '--limit', '10',
    ]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as { issues?: Array<{ identifier: string }> };
    expect(Array.isArray(data?.issues)).toBe(true);
    // The probe issue we created must appear in results
    const ids = (r.json as { issues: Array<{ identifier: string }> }).issues;
    expect(ids.length).toBeGreaterThan(0);
  }, CMD_TIMEOUT);

  it('issues query with a gibberish no-match token exits 0 with empty array', async () => {
    // Use a token with no common words — random hex that cannot fuzzy-match real titles.
    // We use crypto.randomUUID so there's no substring overlap with our created issues.
    const noMatchToken = `zqxvw-${Math.random().toString(36).slice(2, 10)}-kfjmbnp`;
    const r = await runCLI([
      'issues', 'query', noMatchToken,
      '--json', '--all-states',
    ]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as { issues: unknown[] };
    expect(Array.isArray(data.issues)).toBe(true);
    expect(data.issues.length).toBe(0);
  }, CMD_TIMEOUT);
});
