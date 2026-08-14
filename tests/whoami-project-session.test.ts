import { describe, expect, it, vi } from 'vitest';

/**
 * Real end-to-end through the actual credential resolution chain (unmocked
 * resolveCredential/credentials store) — only the Linear SDK network boundary
 * is mocked. Confirms `whoami` reports the identity resolved from the
 * cwd-LINKED workspace credential (registry match), errors with a hint when
 * unlinked, and shows no team row for env-authed-unlinked runs.
 *
 * Kept in its own file (rather than alongside tests/whoami.test.ts, which mocks
 * '../src/lib/client/index.js' on nearly every test) so there is no risk of a
 * stale vi.doMock factory for that module leaking into this real-file test via
 * shared module-registry state within the same file.
 */
vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn().mockImplementation((opts: { apiKey?: string; accessToken?: string }) => {
    let name = 'WRONG Identity';
    if (opts.apiKey === 'linked-key-in-use') name = 'Linked Identity';
    if (opts.accessToken === 'env-access-token') name = 'Env Identity';
    return {
      // getClientWithAuthRetry patches `.client.request` on the returned instance —
      // must be present even though this test never issues a raw GraphQL request.
      client: { request: vi.fn() },
      get viewer() {
        return Promise.resolve({
          id: 'u-1',
          name,
          email: 'u@example.com',
        });
      },
      get organization() {
        return Promise.resolve({ id: 'org-linked', name: 'Acme', urlKey: 'acme' });
      },
    };
  }),
}));

import { writeWorkspaceCredential } from '../src/features/auth/credentials.js';
import { runWhoami } from '../src/features/auth/whoami.js';
import { linkProject } from '../src/features/keepalive/registry.js';
import { useTmpProjectAndHome } from './helpers/tmp-env.js';

describe('whoami: uses cwd-linked workspace credential (integration)', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-whoami-project-',
    homePrefix: 'linear-whoami-home-',
    deleteEnvVars: ['LINEAR_API_KEY', 'LINEAR_ACCESS_TOKEN', 'LINEAR_WORKSPACE'],
    extraTeardown: () => {
      process.exitCode = undefined;
    },
  });

  it('reports identity + registry team when cwd is linked', async () => {
    await writeWorkspaceCredential('ws-linked', { apiKey: 'linked-key-in-use' });
    await writeWorkspaceCredential('ws-other', { apiKey: 'other-key-not-used' });
    await linkProject(tmpEnv.projectDir, 'ws-linked', { id: 'team-1', key: 'ENG' });

    process.cwd = () => tmpEnv.projectDir;

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runWhoami({ plain: true });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('User: Linked Identity');
    expect(output).not.toContain('WRONG Identity');
    expect(output).toContain('team: ENG');

    consoleSpy.mockRestore();
  });

  it('unlinked cwd with stored credentials → hint, no identity printed', async () => {
    // Credentials exist but the cwd is not linked → workspace-select hint.
    await writeWorkspaceCredential('ws-stored', { apiKey: 'stored-key' });

    process.cwd = () => tmpEnv.projectDir;

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runWhoami({ plain: true });

    const allErrors = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErrors).toContain("This directory isn't linked to a workspace");
    expect(allErrors).toContain('linear workspace select');
    expect(process.exitCode).toBe(1);
    expect(logSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('env-authed unlinked cwd → identity, NO team row', async () => {
    process.env.LINEAR_ACCESS_TOKEN = 'env-access-token';
    process.cwd = () => tmpEnv.projectDir;

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runWhoami({ plain: true });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('User: Env Identity');
    expect(output).not.toContain('WRONG Identity');
    expect(output).not.toMatch(/^team:/m);

    consoleSpy.mockRestore();
  });
});
