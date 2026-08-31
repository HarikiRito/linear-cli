import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTmpProjectAndHome } from '../../../../../tests/helpers/tmp-env.js';
import { linkProject, updateEntry } from '../../../keepalive/registry.js';

/**
 * Workspace project scoping: a cwd-linked registry entry with a project
 * selection hard-scopes default project filtering and issue identifier
 * resolution to those projects. Unlinked dirs, and linked dirs without a
 * project selection, are unaffected (existing behavior).
 */
describe('workspace project scoping', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-scope-project-',
    homePrefix: 'linear-scope-home-',
    deleteEnvVars: ['LINEAR_TEAM_ID', 'LINEAR_WORKSPACE'],
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  function writeGlobalConfig(content: string): void {
    const dir = path.join(tmpEnv.homeDir, '.config', '.linear');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.toml'), content, 'utf-8');
  }

  describe('getScopedProjectIds / getDefaultProjectIds precedence', () => {
    it('unlinked dir: no scope, falls back to global config default', async () => {
      writeGlobalConfig('[[projects]]\nid = "g1"\nname = "Global"\n');
      process.cwd = () => tmpEnv.projectDir;

      const { getDefaultProjectIds, getScopedProjectIds } = await import('../resolve.js');
      expect(getScopedProjectIds()).toBeUndefined();
      expect(getDefaultProjectIds()).toEqual(['g1']);
    });

    it('linked dir with a project selection hard-scopes over the global config default', async () => {
      writeGlobalConfig('[[projects]]\nid = "g1"\nname = "Global"\n');
      await linkProject(tmpEnv.projectDir, 'ws-1');
      await updateEntry(tmpEnv.projectDir, {
        projects: [
          { id: 'p1', name: 'Scoped' },
          { id: 'p2', name: 'Scoped 2' },
        ],
      });
      process.cwd = () => tmpEnv.projectDir;

      const { getDefaultProjectIds, getScopedProjectIds } = await import('../resolve.js');
      expect(getScopedProjectIds()).toEqual(['p1', 'p2']);
      expect(getDefaultProjectIds()).toEqual(['p1', 'p2']);
    });

    it('linked dir without a project selection: no scope, falls back to global config default', async () => {
      writeGlobalConfig('[[projects]]\nid = "g1"\nname = "Global"\n');
      await linkProject(tmpEnv.projectDir, 'ws-1');
      process.cwd = () => tmpEnv.projectDir;

      const { getDefaultProjectIds, getScopedProjectIds } = await import('../resolve.js');
      expect(getScopedProjectIds()).toBeUndefined();
      expect(getDefaultProjectIds()).toEqual(['g1']);
    });

    it('explicit --project overrides scope entirely, including a project outside it', async () => {
      await linkProject(tmpEnv.projectDir, 'ws-1');
      await updateEntry(tmpEnv.projectDir, { projects: [{ id: 'p1', name: 'Scoped' }] });
      process.cwd = () => tmpEnv.projectDir;

      const { resolveDefaultProjectId } = await import('../resolve.js');
      expect(resolveDefaultProjectId('out-of-scope-project')).toBe('out-of-scope-project');
    });
  });

  describe('resolveDefaultProjectId / projectRequiredError — no first-scoped fallback', () => {
    it('no explicit --project: returns undefined even with a single scoped project', async () => {
      await linkProject(tmpEnv.projectDir, 'ws-1');
      await updateEntry(tmpEnv.projectDir, { projects: [{ id: 'p1', name: 'Scoped' }] });
      process.cwd = () => tmpEnv.projectDir;

      const { resolveDefaultProjectId } = await import('../resolve.js');
      expect(resolveDefaultProjectId(undefined)).toBeUndefined();
    });

    it('no explicit --project: returns undefined with multiple scoped projects', async () => {
      await linkProject(tmpEnv.projectDir, 'ws-1');
      await updateEntry(tmpEnv.projectDir, {
        projects: [
          { id: 'p1', name: 'Scoped' },
          { id: 'p2', name: 'Scoped 2' },
        ],
      });
      process.cwd = () => tmpEnv.projectDir;

      const { resolveDefaultProjectId } = await import('../resolve.js');
      expect(resolveDefaultProjectId(undefined)).toBeUndefined();
    });

    it('no explicit --project and no scope: returns undefined even with a global config default', async () => {
      writeGlobalConfig('[[projects]]\nid = "g1"\nname = "Global"\n');
      process.cwd = () => tmpEnv.projectDir;

      const { resolveDefaultProjectId } = await import('../resolve.js');
      expect(resolveDefaultProjectId(undefined)).toBeUndefined();
    });

    it('projectRequiredError includes scoped project names as a hint when scope is active', async () => {
      await linkProject(tmpEnv.projectDir, 'ws-1');
      await updateEntry(tmpEnv.projectDir, {
        projects: [
          { id: 'p1', name: 'Alpha' },
          { id: 'p2', name: 'Beta' },
        ],
      });
      process.cwd = () => tmpEnv.projectDir;

      const { projectRequiredError } = await import('../resolve.js');
      const error = projectRequiredError('milestones create');
      expect(error.message).toBe(
        '--project is required for milestones create. Scoped projects: Alpha, Beta — pass --project <name-or-id>'
      );
    });

    it('projectRequiredError has no hint when no scope is active', async () => {
      process.cwd = () => tmpEnv.projectDir;

      const { projectRequiredError } = await import('../resolve.js');
      const error = projectRequiredError('milestones create');
      expect(error.message).toBe('--project is required for milestones create');
    });
  });

  describe('resolveIssueIdentifier hard-scope enforcement', () => {
    it('unlinked dir: resolves normally, no scope-check request', async () => {
      process.cwd = () => tmpEnv.projectDir;
      const requestFn = vi.fn();
      vi.doMock('../../../../lib/client/index.js', () => ({
        getRequestFn: vi.fn().mockReturnValue(requestFn),
      }));

      const { resolveIssueIdentifier } = await import('../resolve.js');
      const result = await resolveIssueIdentifier('ENG-1', {} as never);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('ENG-1');
      expect(requestFn).not.toHaveBeenCalled();
    });

    it('linked+scoped: resolves an issue whose project is in scope', async () => {
      await linkProject(tmpEnv.projectDir, 'ws-1');
      await updateEntry(tmpEnv.projectDir, { projects: [{ id: 'p1', name: 'Scoped' }] });
      process.cwd = () => tmpEnv.projectDir;

      const requestFn = vi.fn().mockResolvedValue({ issue: { project: { id: 'p1' } } });
      vi.doMock('../../../../lib/client/index.js', () => ({
        getRequestFn: vi.fn().mockReturnValue(requestFn),
      }));

      const { resolveIssueIdentifier } = await import('../resolve.js');
      const result = await resolveIssueIdentifier('ENG-1', {} as never);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('ENG-1');
    });

    it('linked+scoped: reports NotFoundError for an issue outside the scoped projects', async () => {
      await linkProject(tmpEnv.projectDir, 'ws-1');
      await updateEntry(tmpEnv.projectDir, { projects: [{ id: 'p1', name: 'Scoped' }] });
      process.cwd = () => tmpEnv.projectDir;

      const requestFn = vi.fn().mockResolvedValue({ issue: { project: { id: 'unrelated' } } });
      vi.doMock('../../../../lib/client/index.js', () => ({
        getRequestFn: vi.fn().mockReturnValue(requestFn),
      }));

      const { resolveIssueIdentifier } = await import('../resolve.js');
      const result = await resolveIssueIdentifier('OTHER-1', {} as never);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().name).toBe('NotFoundError');
    });
  });
});
