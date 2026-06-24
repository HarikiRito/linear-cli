/**
 * E2E tests: issue comments (add, reply, update, list, delete).
 * Creates one issue to work with; tracked and deleted in afterAll.
 *
 * Team name is discovered at runtime via discoverTeam().
 *
 * Gate: RUN_E2E=1
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { RUN_E2E, CMD_TIMEOUT, CLI, runCLI, discoverTeam, makeRegistry, uniqueName } from './helpers.js';

/** Run CLI with a fixed string piped to stdin. */
function runCLIWithStdin(
  args: string[],
  stdinData: string
): Promise<{ stdout: string; stderr: string; code: number; json?: unknown }> {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code) => {
      let json: unknown;
      const t = stdout.trim();
      if (t.startsWith('{') || t.startsWith('[')) { try { json = JSON.parse(t); } catch { /* ignore */ } }
      resolve({ stdout, stderr, code: code ?? 1, json });
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
      'issues', 'create',
      '--title', uniqueName('e2e-comments-issue'),
      '--team', team.name,
      '--json',
    ]);
    if (r.code !== 0) {
      throw new Error(`Setup failed: could not create issue.\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    }
    const data = r.json as { issue: { id: string } };
    issueId = data.issue.id;
    reg.trackIssue(issueId);
  }, CMD_TIMEOUT);

  // ── comment add ──────────────────────────────────────────────────────────

  it('comment add --body --json returns comment with id, body, url', async () => {
    expect(issueId).not.toBe('');
    const body = `e2e root comment ${ts}`;

    const r = await runCLI([
      'issues', 'comment', 'add', issueId,
      '--body', body,
      '--json',
    ]);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    const data = r.json as { comment?: { id: string; body: string; url: string; createdAt: string; author: string } };
    expect(data?.comment).toBeDefined();
    expect(typeof data.comment!.id).toBe('string');
    expect(data.comment!.id).not.toBe('');
    expect(data.comment!.body).toBe(body);
    expect(data.comment!.url).toContain('linear.app');

    rootCommentId = data.comment!.id;
    reg.trackComment(rootCommentId);
  }, CMD_TIMEOUT);

  it('comment add via --body - (stdin) exits 0 and stores body', async () => {
    expect(issueId).not.toBe('');
    const stdinBody = `e2e stdin comment ${ts}`;

    const r = await runCLIWithStdin(
      ['issues', 'comment', 'add', issueId, '--body', '-', '--json'],
      stdinBody
    );
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    const data = r.json as { comment?: { id: string; body: string } };
    const commentId2 = data?.comment?.id ?? '';
    const commentBody2 = data?.comment?.body ?? '';
    expect(commentId2).toBeTruthy();
    expect(commentBody2).toBe(stdinBody);
    reg.trackComment(commentId2);
  }, CMD_TIMEOUT);

  // ── comment reply ────────────────────────────────────────────────────────

  it('comment reply <commentId> --json returns reply', async () => {
    expect(rootCommentId).not.toBe('');
    const replyBody = `e2e reply ${ts}`;

    const r = await runCLI([
      'issues', 'comment', 'reply', rootCommentId,
      '--body', replyBody,
      '--json',
    ]);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    const data = r.json as { comment?: { id: string; body: string } };
    expect(data?.comment).toBeDefined();
    expect(data.comment!.id).not.toBe('');
    expect(data.comment!.body).toBe(replyBody);

    replyCommentId = data.comment!.id;
    reg.trackComment(replyCommentId);
  }, CMD_TIMEOUT);

  // ── comment update ───────────────────────────────────────────────────────

  it('comment update --body --json reflects changed body', async () => {
    expect(rootCommentId).not.toBe('');
    const editedBody = `e2e edited ${ts}`;

    const r = await runCLI([
      'issues', 'comment', 'update', rootCommentId,
      '--body', editedBody,
      '--json',
    ]);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    const data = r.json as { comment?: { id: string; body: string } };
    expect(data?.comment?.id).toBe(rootCommentId);
    expect(data?.comment?.body).toBe(editedBody);
  }, CMD_TIMEOUT);

  // ── comment list ─────────────────────────────────────────────────────────

  it('comment list <issueId> --json returns array including root comment and reply', async () => {
    expect(issueId).not.toBe('');
    expect(rootCommentId).not.toBe('');

    const r = await runCLI(['issues', 'comment', 'list', issueId, '--json']);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    const data = r.json as { comments?: Array<{ id: string; body: string; thread: string }> };
    expect(Array.isArray(data?.comments)).toBe(true);
    const ids = data.comments!.map((c) => c.id);
    expect(ids).toContain(rootCommentId);
    if (replyCommentId) {
      expect(ids).toContain(replyCommentId);
      const reply = data.comments!.find((c) => c.id === replyCommentId);
      expect(reply?.thread).toContain(rootCommentId);
    }
  }, CMD_TIMEOUT);

  it('comment list --limit 1 --json returns at most 1 comment', async () => {
    expect(issueId).not.toBe('');
    const r = await runCLI(['issues', 'comment', 'list', issueId, '--json', '--limit', '1']);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const data = r.json as { comments: unknown[] };
    expect(data.comments.length).toBeLessThanOrEqual(1);
  }, CMD_TIMEOUT);

  // ── comment delete ───────────────────────────────────────────────────────

  it('comment delete without --yes in non-TTY exits non-zero', async () => {
    expect(rootCommentId).not.toBe('');
    const r = await runCLI(['issues', 'comment', 'delete', rootCommentId]);
    expect(r.code).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/--yes|non-interactively/i);
  }, CMD_TIMEOUT);

  it('comment delete --yes exits 0', async () => {
    if (replyCommentId) {
      const r = await runCLI(['issues', 'comment', 'delete', replyCommentId, '--yes']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    }
    if (rootCommentId) {
      const r = await runCLI(['issues', 'comment', 'delete', rootCommentId, '--yes']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    }
  }, CMD_TIMEOUT);
});
