/**
 * E2E tests: projects query / documents query.
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

describe.skipIf(!RUN_E2E)('projects/documents query E2E', () => {
  const reg = makeRegistry();
  const token = uniqueName('e2esearch');
  const gibberish = 'zzqxjvkwpl';
  let projectId = '';

  beforeAll(async () => {
    const team = await discoverTeam();
    const p = await runCLI(['projects', 'create', '--name', token, '--team', team.name, '--plain']);
    if (p.code !== 0) throw new Error(`Failed to create project: ${p.stderr}`);
    projectId = parsePlainRecord(p.stdout).id ?? '';
    reg.trackProject(projectId);

    const d = await runCLI([
      'documents',
      'create',
      '--title',
      token,
      '--project',
      projectId,
      '--plain',
    ]);
    if (d.code !== 0) throw new Error(`Failed to create document: ${d.stderr}`);
    reg.trackDocument(parsePlainRecord(d.stdout).id ?? '');
  }, CMD_TIMEOUT * 3);

  it(
    'projects query finds the probe project by its unique title token',
    async () => {
      const r = await runCLI(['projects', 'query', token, '--plain']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      expect(parsePlainList(r.stdout).map((p) => p._primaryId)).toContain(token);
    },
    CMD_TIMEOUT
  );

  it(
    'documents query finds the probe document by its unique title token',
    async () => {
      const r = await runCLI(['documents', 'query', token, '--plain']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      expect(parsePlainList(r.stdout).map((d) => d._primaryId)).toContain(token);
    },
    CMD_TIMEOUT
  );

  it(
    'gibberish returns no projects or documents',
    async () => {
      for (const area of ['projects', 'documents']) {
        const r = await runCLI([area, 'query', gibberish, '--plain']);
        expect(r.code, `stderr: ${r.stderr}`).toBe(0);
        expect(parsePlainList(r.stdout).filter((x) => x._primaryId)).toEqual([]);
      }
    },
    CMD_TIMEOUT * 2
  );
});
