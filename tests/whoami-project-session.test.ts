import { describe, expect, it, vi } from 'vitest';

/**
 * Real end-to-end through the actual credential resolution chain (unmocked
 * resolveCredential/credentials store) — only the Linear SDK network boundary
 * is mocked. Confirms `whoami` reports the identity resolved from the
 * cwd-LINKED workspace credential (registry match).
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
        id: 'u-linked',
        name: opts.apiKey === 'linked-key-in-use' ? 'Linked Identity' : 'WRONG Identity',
        email: 'linked@example.com',
      });
    },
    get organization() {
      return Promise.resolve({ id: 'org-linked', name: 'Acme', urlKey: 'acme' });
    },
  })),
}));

import { writeWorkspaceCredential } from '../src/features/auth/credentials.js';
import { runWhoami } from '../src/features/auth/whoami.js';
import { linkProject } from '../src/features/keepalive/registry.js';
import { useTmpProjectAndHome } from './helpers/tmp-env.js';

describe('whoami: uses cwd-linked workspace credential (integration)', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-whoami-project-',
    homePrefix: 'linear-whoami-home-',
    deleteEnvVars: ['LINEAR_API_KEY', 'LINEAR_ACCESS_TOKEN'],
    extraTeardown: () => {
      process.exitCode = undefined;
    },
  });

  it('reports identity from the linked workspace credential when cwd is linked', async () => {
    await writeWorkspaceCredential('ws-linked', { apiKey: 'linked-key-in-use' });
    await writeWorkspaceCredential('ws-other', { apiKey: 'other-key-not-used' });
    await linkProject(tmpEnv.projectDir, 'ws-linked');

    process.cwd = () => tmpEnv.projectDir;

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runWhoami({ plain: true });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('User: Linked Identity');
    expect(output).not.toContain('WRONG Identity');

    consoleSpy.mockRestore();
  });
});
