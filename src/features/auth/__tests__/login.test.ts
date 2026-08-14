import { okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTmpProjectAndHome } from '../../../../tests/helpers/tmp-env.js';
import { isKeepaliveInstalled } from '../../keepalive/scheduler/index.js';
import { runLoginFlow } from '../login.js';
import { startOAuthFlow } from '../oauth.js';

// Drive the real login flow; stub only the interactive/network boundaries.
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  isCancel: (v: unknown) => v === '__CANCEL__',
  select: vi.fn(),
  text: vi.fn(),
  multiselect: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

// No network: client construction + version check are stubbed.
vi.mock('../../../lib/client/index.js', () => ({
  buildLinearClient: () => ({
    organization: Promise.resolve({ id: 'ws-1', name: 'Workspace', urlKey: 'ws' }),
  }),
}));
vi.mock('../../../lib/check-version.js', () => ({ notifyUpdate: vi.fn() }));

// OAuth session comes back without a browser.
vi.mock('../oauth.js', () => ({ startOAuthFlow: vi.fn() }));

// Install check stubbed per test; keep the real scheduler surface intact.
vi.mock('../../keepalive/scheduler/index.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../keepalive/scheduler/index.js')>();
  return { ...mod, isKeepaliveInstalled: vi.fn() };
});

import { select, text } from '@clack/prompts';

const OAUTH_SESSION = {
  accessToken: 'at',
  refreshToken: 'rt',
  expiresAt: Date.now() + 3_600_000,
};

describe('runLoginFlow: keepalive tip', () => {
  useTmpProjectAndHome({
    projectPrefix: 'linear-login-tip-',
    homePrefix: 'linear-login-tip-home-',
    deleteEnvVars: ['LINEAR_API_KEY', 'LINEAR_ACCESS_TOKEN', 'LINEAR_WORKSPACE'],
  });

  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(isKeepaliveInstalled).mockReturnValue(false);
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.clearAllMocks();
  });

  const tipLogged = (): boolean =>
    logSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('keepalive install'))
    );

  async function loginViaOAuth(installed: boolean): Promise<void> {
    vi.mocked(select).mockResolvedValue('oauth');
    vi.mocked(startOAuthFlow).mockReturnValue(okAsync(OAUTH_SESSION));
    vi.mocked(isKeepaliveInstalled).mockReturnValue(installed);
    await runLoginFlow();
  }

  it('shows the keepalive tip for an OAuth session when keepalive is not installed', async () => {
    await loginViaOAuth(false);
    expect(tipLogged()).toBe(true);
  });

  it('suppresses the keepalive tip for an OAuth session when keepalive is installed', async () => {
    await loginViaOAuth(true);
    expect(tipLogged()).toBe(false);
  });

  it('never shows the keepalive tip for an API-key session', async () => {
    vi.mocked(select).mockResolvedValue('apikey');
    vi.mocked(text).mockResolvedValue('lin_api_test_key');
    await runLoginFlow();
    expect(tipLogged()).toBe(false);
  });
});
