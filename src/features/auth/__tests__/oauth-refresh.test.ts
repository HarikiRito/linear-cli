import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports that use these modules
// ---------------------------------------------------------------------------

vi.mock('../credentials.js', () => ({
  readWorkspaceCredential: vi.fn(),
  writeWorkspaceCredential: vi.fn().mockResolvedValue(undefined),
  listWorkspaceIds: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../keepalive/registry.js', () => ({
  getEntry: vi.fn(),
}));

vi.mock('../../../lib/scope.js', () => ({
  findProjectRoot: vi.fn(),
}));

vi.mock('../../../lib/config-file.js', () => ({
  getGlobalConfigPath: vi.fn().mockReturnValue('/tmp/global/config.toml'),
  readConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../lib/config.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getClientId: () => 'test-client-id',
    LINEAR_TOKEN_URL: 'https://api.linear.app/oauth/token',
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { getEntry, type RegisteredProject } from '../../keepalive/registry.js';
import { readWorkspaceCredential, writeWorkspaceCredential } from '../credentials.js';
import { refreshAccessToken } from '../oauth.js';
import { resolveCredential } from '../resolve.js';

const mockReadWorkspaceCredential = vi.mocked(readWorkspaceCredential);
const mockWriteWorkspaceCredential = vi.mocked(writeWorkspaceCredential);
const mockGetEntry = vi.mocked(getEntry);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(body: Record<string, unknown>, ok = true): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
}

describe('refreshAccessToken', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns {accessToken, refreshToken, expiresAt} and does no disk I/O', async () => {
    mockFetch({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 3600 });

    const before = Date.now();
    const result = await refreshAccessToken('old-rt');
    const after = Date.now();

    expect(result.isOk()).toBe(true);
    const val = result._unsafeUnwrap();
    expect(val.accessToken).toBe('new-at');
    expect(val.refreshToken).toBe('new-rt');
    expect(val.expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(val.expiresAt).toBeLessThanOrEqual(after + 3_600_000);

    // refreshAccessToken itself never writes — the caller persists
    expect(mockWriteWorkspaceCredential).not.toHaveBeenCalled();
  });

  it('falls back to the passed-in refreshToken when response omits refresh_token', async () => {
    mockFetch({ access_token: 'new-at', expires_in: 3600 });

    const result = await refreshAccessToken('old-rt');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().refreshToken).toBe('old-rt');
  });

  it('returns an error when the token endpoint responds with an error status', async () => {
    mockFetch({ error: 'invalid_grant' }, false);

    const result = await refreshAccessToken('bad-rt');
    expect(result.isErr()).toBe(true);
  });
});

describe('resolveCredential — workspace credential refresh + writeback', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_ACCESS_TOKEN;
    delete process.env.LINEAR_WORKSPACE;
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    vi.clearAllMocks();
  });

  it('expired workspace OAuth session → refresh + writeWorkspaceCredential writeback', async () => {
    mockGetEntry.mockReturnValue({ workspace: 'ws-1' } as RegisteredProject);
    mockReadWorkspaceCredential.mockResolvedValue({
      accessToken: 'old-at',
      refreshToken: 'old-rt',
      expiresAt: 0,
    });
    mockFetch({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 3600 });

    const result = await resolveCredential({
      allowInteractive: false,
      projectRoot: '/repo',
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'accessToken', value: 'new-at' });

    expect(mockGetEntry).toHaveBeenCalledWith('/repo');
    expect(mockWriteWorkspaceCredential).toHaveBeenCalledOnce();
    expect(mockWriteWorkspaceCredential).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        accessToken: 'new-at',
        refreshToken: 'new-rt',
        lastRefreshAt: expect.any(Number),
      })
    );
  });

  it('valid workspace OAuth session → no fetch, no write', async () => {
    mockGetEntry.mockReturnValue({ workspace: 'ws-1' } as RegisteredProject);
    mockReadWorkspaceCredential.mockResolvedValue({
      accessToken: 'existing-at',
      refreshToken: 'old-rt',
      expiresAt: Date.now() + 3600_000,
    });
    global.fetch = vi.fn();

    const result = await resolveCredential({
      allowInteractive: false,
      projectRoot: '/repo',
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'accessToken', value: 'existing-at' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockWriteWorkspaceCredential).not.toHaveBeenCalled();
  });

  it('skew buffer: expiresAt 45s in the future triggers proactive refresh', async () => {
    mockGetEntry.mockReturnValue({ workspace: 'ws-1' } as RegisteredProject);
    mockReadWorkspaceCredential.mockResolvedValue({
      accessToken: 'old-at',
      refreshToken: 'old-rt',
      expiresAt: Date.now() + 45_000,
    });
    mockFetch({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 3600 });

    const result = await resolveCredential({
      allowInteractive: false,
      projectRoot: '/repo',
    });
    expect(result._unsafeUnwrap().value).toBe('new-at');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('forceRefresh bypasses expiry guard and refreshes even with a valid token', async () => {
    mockGetEntry.mockReturnValue({ workspace: 'ws-1' } as RegisteredProject);
    mockReadWorkspaceCredential.mockResolvedValue({
      accessToken: 'still-valid',
      refreshToken: 'old-rt',
      expiresAt: Date.now() + 3600_000,
    });
    mockFetch({ access_token: 'force-new-at', refresh_token: 'force-new-rt', expires_in: 3600 });

    const result = await resolveCredential({
      allowInteractive: false,
      forceRefresh: true,
      projectRoot: '/repo',
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toBe('force-new-at');
    expect(mockWriteWorkspaceCredential).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({ accessToken: 'force-new-at' })
    );
  });

  it('API-key workspace session → passthrough, no fetch or writes', async () => {
    mockGetEntry.mockReturnValue({ workspace: 'ws-1' } as RegisteredProject);
    mockReadWorkspaceCredential.mockResolvedValue({ apiKey: 'lin_api_key' });
    global.fetch = vi.fn();

    const result = await resolveCredential({
      allowInteractive: false,
      projectRoot: '/repo',
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'lin_api_key' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockWriteWorkspaceCredential).not.toHaveBeenCalled();
  });

  it('registry entry without workspace → falls through to global lookup', async () => {
    mockGetEntry.mockReturnValue({} as RegisteredProject); // no workspace
    mockReadWorkspaceCredential.mockResolvedValue(null);

    const result = await resolveCredential({
      allowInteractive: false,
      projectRoot: '/repo',
    });
    expect(result.isErr()).toBe(true);
    expect(mockReadWorkspaceCredential).not.toHaveBeenCalled(); // global pick found nothing
  });
});
