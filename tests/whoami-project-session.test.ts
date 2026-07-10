import { describe, expect, it, vi } from 'vitest';

/**
 * Real two-file precedence, end-to-end through the actual credential resolution
 * chain (unmocked resolveCredential/session read layer) — only the Linear SDK
 * network boundary is mocked. Confirms `whoami` reports the identity resolved
 * from the project session when both a project and a global session exist.
 *
 * Kept in its own file (rather than alongside tests/whoami.test.ts, which mocks
 * '../src/lib/client/index.js' on nearly every test) so there is no risk of a
 * stale vi.doMock factory for that module leaking into this real-file test via
 * shared module-registry state within the same file.
 */
vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn().mockImplementation((opts: { apiKey?: string }) => ({
    // getClientWithAuthRetry patches `.client.request` on the returned instance —
    // must be present even though this test never issues a raw GraphQL request.
    client: { request: vi.fn() },
    get viewer() {
      return Promise.resolve({
        id: 'u-project',
        name: opts.apiKey === 'project-key-in-use' ? 'Project Identity' : 'WRONG Identity',
        email: 'project@example.com',
      });
    },
    get organization() {
      return Promise.resolve({ id: 'org', name: 'Acme', urlKey: 'acme' });
    },
  })),
}));

import { writeProjectSession, writeSession } from '../src/features/auth/session.js';
import { runWhoami } from '../src/features/auth/whoami.js';
import { useTmpProjectAndHome } from './helpers/tmp-env.js';

describe('whoami: real project-session precedence (integration)', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-whoami-project-',
    homePrefix: 'linear-whoami-home-',
    deleteEnvVars: ['LINEAR_API_KEY', 'LINEAR_ACCESS_TOKEN'],
    extraTeardown: () => {
      process.exitCode = undefined;
    },
  });

  it('reports identity resolved from the project session when both project and global sessions exist', async () => {
    expect(writeSession({ apiKey: 'global-key-should-not-be-used' }).isOk()).toBe(true);
    expect(
      writeProjectSession(tmpEnv.projectDir, { apiKey: 'project-key-in-use' }).isOk()
    ).toBe(true);

    process.cwd = () => tmpEnv.projectDir;

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runWhoami({ plain: true });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('User: Project Identity');
    expect(output).not.toContain('WRONG Identity');

    consoleSpy.mockRestore();
  });
});
