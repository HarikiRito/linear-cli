/**
 * E2E tests: issues branch command (plain output, bare-number expansion, error case).
 * Creates one issue to work with; tracked and deleted in afterAll.
 *
 * Team is discovered at runtime via discoverTeam().
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

describe.skipIf(!RUN_E2E)('issues branch E2E', () => {
  const reg = makeRegistry();

  let teamId = '';
  let teamKey = '';
  let issueIdentifier = '';
  let bareNumber = '';
  let knownBranchName = '';

  // ── Setup: discover team and create one issue ──────────────────────────────

  beforeAll(async () => {
    const team = await discoverTeam();
    teamId = team.id;
    teamKey = team.key;

    const r = await runCLI([
      'issues',
      'create',
      '--title',
      uniqueName('e2e-branch'),
      '--team',
      team.name,
      '--plain',
    ]);
    if (r.code !== 0) {
      throw new Error(
        `Setup failed: could not create issue.\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
      );
    }
    const data = parsePlainRecord(r.stdout);
    reg.trackIssue(data['id']);
    issueIdentifier = data['_primaryId'];
    // Extract the digits after the dash, e.g. "ENG-42" → "42"
    bareNumber = issueIdentifier.split('-')[1];

    // Fetch the canonical branch name once so tests 2 and 3 can assert against it.
    // The branch command always writes the branch name to stdout (no --plain/--json needed).
    const br = await runCLI(['issues', 'branch', issueIdentifier]);
    if (br.code !== 0) {
      throw new Error(
        `Setup failed: could not fetch branch name for ${issueIdentifier}.\nstdout: ${br.stdout}\nstderr: ${br.stderr}`
      );
    }
    knownBranchName = br.stdout.trim();
  }, CMD_TIMEOUT);

  // ── Test 1: branch command returns a branchName ────────────────────────────

  it(
    'issues branch <identifier> returns a branchName',
    async () => {
      expect(issueIdentifier).not.toBe('');
      const r = await runCLI(['issues', 'branch', issueIdentifier]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const branchName = r.stdout.trim();
      expect(typeof branchName).toBe('string');
      expect(branchName).not.toBe('');
      knownBranchName = branchName;
    },
    CMD_TIMEOUT
  );

  // ── Test 2: plain output prints the branch name ────────────────────────────

  it(
    'plain issues branch <identifier> prints branch name to stdout (not JSON)',
    async () => {
      expect(issueIdentifier).not.toBe('');
      const r = await runCLI(['issues', 'branch', issueIdentifier]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const out = r.stdout.trim();
      expect(out).not.toBe('');
      // Must not be JSON
      expect(out.startsWith('{')).toBe(false);
      expect(out.startsWith('[')).toBe(false);
      // Must match the branch name from the known value
      expect(out).toBe(knownBranchName);
    },
    CMD_TIMEOUT
  );

  // ── Test 3: bare-number expansion matches full identifier ──────────────────

  it(
    'bare-number expansion produces the same branchName as full identifier',
    async () => {
      expect(bareNumber).not.toBe('');
      expect(teamId).not.toBe('');
      process.env.LINEAR_TEAM_ID = teamId;
      try {
        const r = await runCLI(['issues', 'branch', bareNumber]);
        expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
        const branchName = r.stdout.trim();
        expect(typeof branchName).toBe('string');
        expect(branchName).not.toBe('');
        expect(branchName).toBe(knownBranchName);
      } finally {
        delete process.env.LINEAR_TEAM_ID;
      }
    },
    CMD_TIMEOUT
  );

  // ── Test 4: nonexistent issue errors cleanly ───────────────────────────────

  it(
    'nonexistent issue identifier exits non-zero with non-empty stderr',
    async () => {
      expect(teamKey).not.toBe('');
      const r = await runCLI(['issues', 'branch', `${teamKey}-99999999`]);
      expect(r.code).not.toBe(0);
      expect(r.stderr).not.toBe('');
    },
    CMD_TIMEOUT
  );
});
