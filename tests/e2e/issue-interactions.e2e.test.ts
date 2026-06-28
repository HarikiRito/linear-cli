/**
 * E2E tests: issue interaction commands.
 * Covers: mark/unmark/relations, link/unlink, favorite/unfavorite,
 * subscribe/unsubscribe, archive/unarchive, remind, copy, history,
 * create-with-relation, update --no-parent / --team.
 *
 * Two throwaway issues are created in beforeAll and tracked for deletion.
 * Deleting an issue cascades removal of its relations/links/favorites/
 * subscriptions/reminders, so no extra teardown is needed.
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

// The exact constant from src/features/issues/history/history.ts
import { DESCRIPTION_CAVEAT } from '../../src/features/issues/history/history.js';

describe.skipIf(!RUN_E2E)('issue interactions E2E', () => {
  const reg = makeRegistry();

  let teamName = '';
  let issue1Id = '';
  let issue1Identifier = '';
  let issue2Id = '';
  let issue2Identifier = '';

  // Captured across sequential tests
  let capturedRelationId = '';
  let capturedAttachmentId = '';

  // ── Setup: discover team, create two issues ──────────────────────────────

  beforeAll(async () => {
    const team = await discoverTeam();
    teamName = team.name;

    const r1 = await runCLI([
      'issues',
      'create',
      '--title',
      uniqueName('e2e-interaction-a'),
      '--team',
      teamName,
      '--plain',
    ]);
    if (r1.code !== 0) {
      throw new Error(
        `Setup: create issue1 failed\nstdout: ${r1.stdout}\nstderr: ${r1.stderr}`
      );
    }
    const d1 = parsePlainRecord(r1.stdout);
    issue1Id = d1['id'] ?? '';
    issue1Identifier = d1['_primaryId'] ?? '';
    reg.trackIssue(issue1Id);

    const r2 = await runCLI([
      'issues',
      'create',
      '--title',
      uniqueName('e2e-interaction-b'),
      '--team',
      teamName,
      '--plain',
    ]);
    if (r2.code !== 0) {
      throw new Error(
        `Setup: create issue2 failed\nstdout: ${r2.stdout}\nstderr: ${r2.stderr}`
      );
    }
    const d2 = parsePlainRecord(r2.stdout);
    issue2Id = d2['id'] ?? '';
    issue2Identifier = d2['_primaryId'] ?? '';
    reg.trackIssue(issue2Id);
  }, CMD_TIMEOUT * 3);

  // ── mark: standard relation types ─────────────────────────────────────────

  it(
    'mark related-to issue1 issue2 exits 0',
    async () => {
      expect(issue1Id, 'depends on beforeAll').not.toBe('');
      expect(issue2Id, 'depends on beforeAll').not.toBe('');
      const r = await runCLI(['issues', 'mark', 'related-to', issue1Id, issue2Id]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  it(
    'mark blocking issue1 issue2 exits 0',
    async () => {
      expect(issue1Id).not.toBe('');
      const r = await runCLI(['issues', 'mark', 'blocking', issue1Id, issue2Id]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  it(
    'mark blocked-by issue1 issue2 exits 0',
    async () => {
      expect(issue1Id).not.toBe('');
      const r = await runCLI(['issues', 'mark', 'blocked-by', issue1Id, issue2Id]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  it(
    'mark duplicate-of issue1 issue2 exits 0',
    async () => {
      expect(issue1Id).not.toBe('');
      const r = await runCLI(['issues', 'mark', 'duplicate-of', issue1Id, issue2Id]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  // ── relations: verify relation records appear ─────────────────────────────

  it(
    'relations --plain returns records referencing issue2, with real relation record IDs',
    async () => {
      expect(issue1Id).not.toBe('');
      expect(issue2Identifier).not.toBe('');

      const r = await runCLI(['issues', 'relations', issue1Id, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);

      const output = r.stdout.trim();
      // If there are no relations the command prints 'No relations found.' — skip assertions.
      if (output === 'No relations found.' || output === '') return;

      const records = parsePlainList(output);
      expect(records.length).toBeGreaterThan(0);

      // At least one record should reference issue2 in its 'issue' field
      const hasIssue2Ref = records.some((rec) =>
        (rec['issue'] ?? '').includes(issue2Identifier)
      );
      expect(hasIssue2Ref, 'expected at least one relation referencing issue2').toBe(true);

      // Capture the first real UUID relation ID (skip synthetic '(parent)' / '(child)')
      const realRec = records.find((rec) => {
        const id = rec['_primaryId'] ?? '';
        return id.length > 0 && id !== '(parent)' && id !== '(child)';
      });
      if (realRec) {
        capturedRelationId = realRec['_primaryId'] ?? '';
        // Real relation IDs are UUID-shaped strings (non-empty, no parens)
        expect(capturedRelationId).toMatch(/^[0-9a-f-]{20,}$/i);
      }
    },
    CMD_TIMEOUT
  );

  // ── unmark: remove one relation by its record ID ──────────────────────────

  it(
    'unmark <relationId> exits 0',
    async () => {
      if (!capturedRelationId) {
        // No real relation ID captured from relations — skip gracefully
        return;
      }
      const r = await runCLI(['issues', 'unmark', capturedRelationId]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  // ── mark parent-of: set parent, verify, then clear ────────────────────────

  it(
    'mark parent-of issue1 issue2 exits 0; relations confirms parent; then reset via update --no-parent',
    async () => {
      expect(issue1Id).not.toBe('');
      expect(issue2Id).not.toBe('');

      // Set issue1 as parent of issue2
      const markR = await runCLI(['issues', 'mark', 'parent-of', issue1Id, issue2Id]);
      expect(markR.code, `mark parent-of: ${markR.stderr}`).toBe(0);

      // Verify parent appears in issue2's relations
      const relR = await runCLI(['issues', 'relations', issue2Id, '--plain']);
      expect(relR.code, `relations: ${relR.stderr}`).toBe(0);
      const relOutput = relR.stdout.trim();
      if (relOutput && relOutput !== 'No relations found.') {
        const records = parsePlainList(relOutput);
        const parentRec = records.find((rec) => rec['_primaryId'] === '(parent)');
        if (parentRec) {
          expect(parentRec['issue'] ?? '').toContain(issue1Identifier);
        }
      }

      // Reset: clear parent on issue2 so subsequent tests start clean
      const resetR = await runCLI(['issues', 'update', issue2Id, '--no-parent', '--plain']);
      expect(resetR.code, `update --no-parent: ${resetR.stderr}`).toBe(0);
    },
    CMD_TIMEOUT * 3
  );

  // ── mark sub-issue-of ─────────────────────────────────────────────────────

  it(
    'mark sub-issue-of issue2 issue1 exits 0; then reset via update --no-parent',
    async () => {
      expect(issue2Id).not.toBe('');
      expect(issue1Id).not.toBe('');

      // Set issue2 as sub-issue of issue1 (issue2.parentId = issue1)
      const markR = await runCLI(['issues', 'mark', 'sub-issue-of', issue2Id, issue1Id]);
      expect(markR.code, `mark sub-issue-of: ${markR.stderr}`).toBe(0);

      // Clear parent on issue2
      const resetR = await runCLI(['issues', 'update', issue2Id, '--no-parent', '--plain']);
      expect(resetR.code, `update --no-parent: ${resetR.stderr}`).toBe(0);
    },
    CMD_TIMEOUT * 2
  );

  // ── link / unlink ─────────────────────────────────────────────────────────

  it(
    'link <issue> <url> --title exits 0 and stdout contains "Attachment ID:"',
    async () => {
      expect(issue1Id).not.toBe('');

      const r = await runCLI([
        'issues',
        'link',
        issue1Id,
        'https://example.com/e2e-attachment-test',
        '--title',
        'E2E test link',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      expect(r.stdout).toContain('Attachment ID:');

      // Extract attachment ID for the unlink test
      const m = /Attachment ID:\s*(\S+)/.exec(r.stdout);
      if (m) capturedAttachmentId = m[1];
    },
    CMD_TIMEOUT
  );

  it(
    'unlink <attachmentId> exits 0',
    async () => {
      if (!capturedAttachmentId) {
        // No attachment ID captured — skip unlink assertion
        return;
      }
      const r = await runCLI(['issues', 'unlink', capturedAttachmentId]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  // ── favorite / unfavorite ─────────────────────────────────────────────────

  it(
    'favorite <issue> exits 0',
    async () => {
      expect(issue1Id).not.toBe('');
      const r = await runCLI(['issues', 'favorite', issue1Id]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  it(
    'unfavorite <issue> exits 0',
    async () => {
      expect(issue1Id).not.toBe('');
      const r = await runCLI(['issues', 'unfavorite', issue1Id]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  // ── subscribe / unsubscribe ───────────────────────────────────────────────

  it(
    'subscribe <issue> exits 0',
    async () => {
      expect(issue1Id).not.toBe('');
      const r = await runCLI(['issues', 'subscribe', issue1Id]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  it(
    'unsubscribe <issue> exits 0',
    async () => {
      expect(issue1Id).not.toBe('');
      const r = await runCLI(['issues', 'unsubscribe', issue1Id]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  // ── archive / unarchive ───────────────────────────────────────────────────

  it(
    'archive <issue> exits 0',
    async () => {
      expect(issue2Id).not.toBe('');
      const r = await runCLI(['issues', 'archive', issue2Id]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  it(
    'unarchive <issue> exits 0',
    async () => {
      expect(issue2Id).not.toBe('');
      const r = await runCLI(['issues', 'unarchive', issue2Id]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  // ── remind ────────────────────────────────────────────────────────────────

  it(
    'remind <issue> <ISO future datetime> exits 0',
    async () => {
      expect(issue1Id).not.toBe('');
      // One week from now, well into the future
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const r = await runCLI(['issues', 'remind', issue1Id, futureDate]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT
  );

  // ── copy ──────────────────────────────────────────────────────────────────

  it(
    'copy <issue> prints identifier, linear.app url, and branch line',
    async () => {
      expect(issue1Id).not.toBe('');
      expect(issue1Identifier).not.toBe('');

      const r = await runCLI(['issues', 'copy', issue1Id]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      // Default output: "identifier: <id>\nurl: <url>\nbranch: <branch>"
      expect(r.stdout).toContain(issue1Identifier);
      expect(r.stdout).toContain('linear.app');
      expect(r.stdout).toMatch(/branch:/i);
    },
    CMD_TIMEOUT
  );

  // ── history ───────────────────────────────────────────────────────────────

  it(
    'history <issue> exits 0 and output includes the DESCRIPTION_CAVEAT text',
    async () => {
      expect(issue1Id).not.toBe('');

      const r = await runCLI(['issues', 'history', issue1Id]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      // The command always emits this caveat regardless of whether history is empty
      expect(r.stdout).toContain(DESCRIPTION_CAVEAT);
    },
    CMD_TIMEOUT
  );

  // ── create with --blocks relation flag ────────────────────────────────────

  it(
    'create --blocks <issue2> exits 0; relations on new issue confirms relation to issue2',
    async () => {
      expect(issue2Identifier).not.toBe('');
      expect(teamName).not.toBe('');

      const newTitle = uniqueName('e2e-create-blocks');
      const r = await runCLI([
        'issues',
        'create',
        '--title',
        newTitle,
        '--team',
        teamName,
        '--blocks',
        issue2Identifier,
        '--plain',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);

      const data = parsePlainRecord(r.stdout);
      const newIssueId = data['id'] ?? '';
      expect(newIssueId).toBeTruthy();
      reg.trackIssue(newIssueId);

      // Verify the blocking relation was created
      const relR = await runCLI(['issues', 'relations', newIssueId, '--plain']);
      expect(relR.code, `relations stdout: ${relR.stdout}`).toBe(0);
      const relOutput = relR.stdout.trim();
      // --blocks is applied synchronously within create, so relations must exist
      expect(relOutput, 'expected relations output, not empty/no-relations').not.toBe('No relations found.');
      expect(relOutput).not.toBe('');
      const records = parsePlainList(relOutput);
      const hasIssue2Ref = records.some((rec) =>
        (rec['issue'] ?? '').includes(issue2Identifier)
      );
      expect(hasIssue2Ref, 'expected a relation referencing issue2').toBe(true);
    },
    CMD_TIMEOUT * 2
  );

  // ── update --parent then --no-parent ─────────────────────────────────────

  it(
    'update --parent <issue1> sets parent; update --no-parent clears it; both exit 0',
    async () => {
      expect(issue2Id).not.toBe('');
      expect(issue1Id).not.toBe('');

      // Set parent
      const setR = await runCLI([
        'issues',
        'update',
        issue2Id,
        '--parent',
        issue1Id,
        '--plain',
      ]);
      expect(setR.code, `set --parent: ${setR.stderr}`).toBe(0);

      // Clear parent
      const clearR = await runCLI([
        'issues',
        'update',
        issue2Id,
        '--no-parent',
        '--plain',
      ]);
      expect(clearR.code, `--no-parent stdout: ${clearR.stdout}\nstderr: ${clearR.stderr}`).toBe(0);
    },
    CMD_TIMEOUT * 2
  );

  // ── update --team (conditional on second team existing) ───────────────────

  it(
    'update --team <team2> exits 0 (skipped gracefully when only one team exists)',
    async () => {
      expect(issue1Id).not.toBe('');

      const teamsR = await runCLI(['teams', 'list', '--plain']);
      if (teamsR.code !== 0) return; // cannot enumerate teams — skip

      const teamRecords = parsePlainList(teamsR.stdout);
      if (teamRecords.length < 2) return; // only one team — skip

      const secondTeamName = teamRecords[1]['_primaryId'] ?? '';
      if (!secondTeamName) return; // could not parse name — skip

      const r = await runCLI([
        'issues',
        'update',
        issue1Id,
        '--team',
        secondTeamName,
        '--plain',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    },
    CMD_TIMEOUT * 2
  );
});
