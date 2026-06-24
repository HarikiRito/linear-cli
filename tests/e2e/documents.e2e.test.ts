/**
 * E2E tests: documents CRUD (list, create, get, update).
 *
 * A project is created in beforeAll to host the documents.
 * All created resources are cleaned up in afterAll.
 *
 * Gate: RUN_E2E=1
 */

import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CMD_TIMEOUT,
  discoverTeam,
  RUN_E2E,
  runCLI,
  type TeamInfo,
  uniqueName,
} from './helpers.js';

describe.skipIf(!RUN_E2E)('documents CRUD E2E', () => {
  let team: TeamInfo;
  let projectId = '';
  let documentId = '';
  let documentTitle = '';

  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    team = await discoverTeam();

    // Create a project to attach documents to
    const projName = uniqueName('e2e-doc-proj');
    const r = await runCLI([
      'projects',
      'create',
      '--name',
      projName,
      '--team',
      team.name,
      '--json',
    ]);
    if (r.code !== 0) {
      throw new Error(`Failed to create project for documents E2E: ${r.stderr}`);
    }
    const data = r.json as { project?: { id: string } };
    projectId = data.project?.id ?? '';
    if (!projectId) throw new Error('No project id returned from create');
    createdProjectIds.push(projectId);
  }, CMD_TIMEOUT * 2);

  afterAll(async () => {
    // Best-effort: mark projects as cancelled
    for (const id of createdProjectIds) {
      try {
        await runCLI(['projects', 'update', id, '--state', 'cancelled']);
      } catch {
        /* best-effort */
      }
    }
  }, CMD_TIMEOUT * 3);

  // ── list (no project filter) ──────────────────────────────────────────────

  it(
    'documents list --json exits 0 and returns documents array',
    async () => {
      const r = await runCLI(['documents', 'list', '--json']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const data = r.json as { documents?: unknown[]; pageInfo?: { hasNextPage: boolean } };
      expect(Array.isArray(data?.documents)).toBe(true);
      expect(data.pageInfo).toBeDefined();
    },
    CMD_TIMEOUT
  );

  // ── create ────────────────────────────────────────────────────────────────

  it(
    'documents create --json returns document with id, title, slugId',
    async () => {
      expect(projectId, 'project must be created').not.toBe('');
      documentTitle = uniqueName('e2e-doc');
      const r = await runCLI([
        'documents',
        'create',
        '--title',
        documentTitle,
        '--project',
        projectId,
        '--json',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as { document?: { id: string; title: string; slugId: string } };
      expect(data?.document).toBeDefined();
      expect(typeof data.document?.id).toBe('string');
      expect(data.document?.id).not.toBe('');
      expect(data.document?.title).toBe(documentTitle);
      expect(typeof data.document?.slugId).toBe('string');

      documentId = data.document?.id ?? '';
    },
    CMD_TIMEOUT
  );

  it(
    'documents create --content-file reads file content',
    async () => {
      expect(projectId, 'project must be created').not.toBe('');
      const contentText = '# E2E Test Content\n\nThis was written from a file.';
      const tmpPath = join(tmpdir(), `e2e-content-${Date.now()}.md`);
      await writeFile(tmpPath, contentText, 'utf-8');

      try {
        const r = await runCLI([
          'documents',
          'create',
          '--title',
          uniqueName('e2e-doc-file'),
          '--project',
          projectId,
          '--content-file',
          tmpPath,
          '--json',
        ]);
        expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
        const data = r.json as { document?: { id: string; content: string | null } };
        expect(data?.document).toBeDefined();
        // Content may be normalized by Linear but should contain the text
        if (data.document?.content !== null && data.document?.content !== undefined) {
          expect(data.document.content).toContain('E2E Test Content');
        }
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    },
    CMD_TIMEOUT
  );

  // ── get ───────────────────────────────────────────────────────────────────

  it(
    'documents get <id> --json returns full document',
    async () => {
      expect(documentId, 'depends on create').not.toBe('');
      const r = await runCLI(['documents', 'get', documentId, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as {
        document?: {
          id: string;
          title: string;
          slugId: string;
          content: string | null;
          project?: { id: string };
        };
      };
      expect(data?.document).toBeDefined();
      expect(data.document?.id).toBe(documentId);
      expect(data.document?.title).toBe(documentTitle);
      expect(typeof data.document?.slugId).toBe('string');
      expect('content' in (data.document ?? {})).toBe(true);
      expect(data.document?.project?.id).toBe(projectId);
    },
    CMD_TIMEOUT
  );

  // ── update ────────────────────────────────────────────────────────────────

  it(
    'documents update <id> --title --json reflects title change',
    async () => {
      expect(documentId, 'depends on create').not.toBe('');
      const newTitle = uniqueName('e2e-doc-updated');
      const r = await runCLI(['documents', 'update', documentId, '--title', newTitle, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as { document?: { id: string; title: string } };
      expect(data?.document).toBeDefined();
      expect(data.document?.id).toBe(documentId);
      expect(data.document?.title).toBe(newTitle);
      documentTitle = newTitle;
    },
    CMD_TIMEOUT
  );

  // ── list with project filter ───────────────────────────────────────────────

  it(
    'documents list --project <id> --json scopes to project',
    async () => {
      expect(projectId, 'depends on create').not.toBe('');
      const r = await runCLI(['documents', 'list', '--project', projectId, '--json']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = r.json as { documents?: { id: string }[] };
      expect(Array.isArray(data?.documents)).toBe(true);
      // The document we created should appear
      const found = data.documents?.some((d) => d.id === documentId);
      expect(found).toBe(true);
    },
    CMD_TIMEOUT
  );
});
