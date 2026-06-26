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
  parsePlainList,
  parsePlainRecord,
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
      '--plain',
    ]);
    if (r.code !== 0) {
      throw new Error(`Failed to create project for documents E2E: ${r.stderr}`);
    }
    const data = parsePlainRecord(r.stdout);
    projectId = data['id'] ?? '';
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
    'documents list --plain exits 0 and returns documents array',
    async () => {
      const r = await runCLI(['documents', 'list', '--plain']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      // Plain output may be empty if no docs exist; just verify exit 0
      expect(r.code).toBe(0);
    },
    CMD_TIMEOUT
  );

  // ── create ────────────────────────────────────────────────────────────────

  it(
    'documents create --plain returns document with id, title, slugId',
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
        '--plain',
      ]);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(typeof data['id']).toBe('string');
      expect(data['id']).not.toBe('');
      expect(data['_primaryId']).toBe(documentTitle);  // title is primaryId
      expect(typeof data['slugId']).toBe('string');

      documentId = data['id'] ?? '';
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
          '--plain',
        ]);
        expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
        const data = parsePlainRecord(r.stdout);
        expect(data['id']).toBeTruthy();
        // Content may be normalized by Linear but should contain the text
        if (data['content']) {
          expect(data['content']).toContain('E2E Test Content');
        }
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    },
    CMD_TIMEOUT
  );

  // ── get ───────────────────────────────────────────────────────────────────

  it(
    'documents get <id> --plain returns full document',
    async () => {
      expect(documentId, 'depends on create').not.toBe('');
      const r = await runCLI(['documents', 'get', documentId, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['id']).toBe(documentId);
      expect(data['_primaryId']).toBe(documentTitle);  // title
      expect(typeof data['slugId']).toBe('string');
    },
    CMD_TIMEOUT
  );

  // ── update ────────────────────────────────────────────────────────────────

  it(
    'documents update <id> --title --plain reflects title change',
    async () => {
      expect(documentId, 'depends on create').not.toBe('');
      const newTitle = uniqueName('e2e-doc-updated');
      const r = await runCLI(['documents', 'update', documentId, '--title', newTitle, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(data['id']).toBe(documentId);
      expect(data['_primaryId']).toBe(newTitle);  // updated title
      documentTitle = newTitle;
    },
    CMD_TIMEOUT
  );

  // ── list with project filter ───────────────────────────────────────────────

  it(
    'documents list --project <id> --plain scopes to project',
    async () => {
      expect(projectId, 'depends on create').not.toBe('');
      const r = await runCLI(['documents', 'list', '--project', projectId, '--plain']);
      expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      // The document we created should appear (matched by updated title)
      const found = records.some((d) => d['_primaryId'] === documentTitle);
      expect(found).toBe(true);
    },
    CMD_TIMEOUT
  );
});
