/**
 * E2E tests: issue comments (add, reply, update, list, delete).
 * Creates one issue to work with; tracked and deleted in afterAll.
 *
 * Team name is discovered at runtime via discoverTeam().
 *
 * Gate: RUN_E2E=1
 */

import { spawn } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CLI,
  CMD_TIMEOUT,
  discoverTeam,
  makeRegistry,
  parsePlainRecord,
  RUN_E2E,
  runCLI,
  uniqueName,
} from './helpers.js';

/** Run CLI with a fixed string piped to stdin. */
function runCLIWithStdin(
  args: string[],
  stdinData: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.stdin.write(stdinData);
    child.stdin.end();
  });
}

describe.skipIf(!RUN_E2E)('comments E2E', () => {
  const reg = makeRegistry();
  const ts = Date.now();

  let issueId = '';
  let rootCommentId = '';
  let replyCommentId = '';

  // ── Setup: discover team and create one issue ────────────────────────────

  beforeAll(async () => {
    const team = await discoverTeam();
    const r = await runCLI([
      'issues',
      'create',
      '--title',
      uniqueName('e2e-comments-issue'),
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
    issueId = data['id'];
    reg.trackIssue(issueId);
  }, CMD_TIMEOUT);

  // ── comment add ──────────────────────────────────────────────────────────

  it(
    'comment add --body --plain returns comment with id, body, url',
    async () => {
      expect(issueId).not.toBe('');
      const body = `e2e root comment ${ts}`;

      const r = await runCLI(['issues', 'comment', 'add', issueId, '--body', body, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['_primaryId']).toBeTruthy();  // comment UUID as primaryId
      expect(data['body']).toBe(body);
      expect(data['url']).toContain('linear.app');

      rootCommentId = data['_primaryId'];
      reg.trackComment(rootCommentId);
    },
    CMD_TIMEOUT
  );

  it(
    'comment add via --body - (stdin) exits 0 and stores body',
    async () => {
      expect(issueId).not.toBe('');
      const stdinBody = `e2e stdin comment ${ts}`;

      const r = await runCLIWithStdin(
        ['issues', 'comment', 'add', issueId, '--body', '-', '--plain'],
        stdinBody
      );
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      const commentId2 = data['_primaryId'] ?? '';
      const commentBody2 = data['body'] ?? '';
      expect(commentId2).toBeTruthy();
      expect(commentBody2).toBe(stdinBody);
      reg.trackComment(commentId2);
    },
    CMD_TIMEOUT
  );

  // ── comment reply ────────────────────────────────────────────────────────

  it(
    'comment reply <commentId> --plain returns reply',
    async () => {
      expect(rootCommentId).not.toBe('');
      const replyBody = `e2e reply ${ts}`;

      const r = await runCLI([
        'issues',
        'comment',
        'reply',
        rootCommentId,
        '--body',
        replyBody,
        '--plain',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['_primaryId']).toBeTruthy();  // comment UUID
      expect(data['body']).toBe(replyBody);

      replyCommentId = data['_primaryId'];
      reg.trackComment(replyCommentId);
    },
    CMD_TIMEOUT
  );

  // ── comment update ───────────────────────────────────────────────────────

  it(
    'comment update --body --plain reflects changed body',
    async () => {
      expect(rootCommentId).not.toBe('');
      const editedBody = `e2e edited ${ts}`;

      const r = await runCLI([
        'issues',
        'comment',
        'update',
        rootCommentId,
        '--body',
        editedBody,
        '--plain',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['_primaryId']).toBe(rootCommentId);
      expect(data['body']).toBe(editedBody);
    },
    CMD_TIMEOUT
  );

  // ── comment list ─────────────────────────────────────────────────────────

  it(
    'comment list <issueId> --plain returns records including root comment and reply',
    async () => {
      expect(issueId).not.toBe('');
      expect(rootCommentId).not.toBe('');

      const r = await runCLI(['issues', 'comment', 'list', issueId, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const records = r.stdout.trim().split('\n---\n').map((s) => parsePlainRecord(s));
      const ids = records.map((c) => c['_primaryId']);
      expect(ids).toContain(rootCommentId);
      if (replyCommentId) {
        expect(ids).toContain(replyCommentId);
        const reply = records.find((c) => c['_primaryId'] === replyCommentId);
        expect(reply?.['thread']).toContain(rootCommentId);
      }
    },
    CMD_TIMEOUT
  );

  it(
    'comment list --limit 1 --plain returns at most 1 comment',
    async () => {
      expect(issueId).not.toBe('');
      const r = await runCLI(['issues', 'comment', 'list', issueId, '--plain', '--limit', '1']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = r.stdout.trim() ? r.stdout.trim().split('\n---\n') : [];
      expect(records.length).toBeLessThanOrEqual(1);
    },
    CMD_TIMEOUT
  );

  // ── comment delete ───────────────────────────────────────────────────────

  it(
    'comment delete without --yes in non-TTY exits non-zero',
    async () => {
      expect(rootCommentId).not.toBe('');
      const r = await runCLI(['issues', 'comment', 'delete', rootCommentId]);
      expect(r.code).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/--yes|non-interactively/i);
    },
    CMD_TIMEOUT
  );

  it(
    'comment delete --yes exits 0',
    async () => {
      if (replyCommentId) {
        const r = await runCLI(['issues', 'comment', 'delete', replyCommentId, '--yes']);
        expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      }
      if (rootCommentId) {
        const r = await runCLI(['issues', 'comment', 'delete', rootCommentId, '--yes']);
        expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      }
    },
    CMD_TIMEOUT
  );
});
