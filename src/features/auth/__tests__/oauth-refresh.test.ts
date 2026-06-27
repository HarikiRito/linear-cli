import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports that use these modules
// ---------------------------------------------------------------------------

vi.mock('../session.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../session.js')>();
  return {
    ...actual,
    writeSession: vi.fn().mockReturnValue({ isOk: () => true, isErr: () => false }),
    writeProjectSession: vi.fn().mockReturnValue({ isOk: () => true, isErr: () => false }),
    readSession: vi.fn().mockReturnValue(null),
  };
});

vi.mock('../../lib/config.js', async (importOriginal) => {
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

import { refreshAccessToken } from '../oauth.js';
import { writeProjectSession, writeSession } from '../session.js';

// We test resolveSessionWithRefresh indirectly via resolveCredential since
// resolveSessionWithRefresh is not exported. We mock process.env and session
// helpers to control which session is read.
import * as sessionMod from '../session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(body: Record<string, unknown>, ok = true): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// refreshAccessToken — pure network call, no disk I/O
// ---------------------------------------------------------------------------

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

    // No disk I/O inside oauth.ts
    expect(writeSession).not.toHaveBeenCalled();
    expect(writeProjectSession).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// resolveSessionWithRefresh — scope-aware persist + skew buffer
// We exercise this via resolveCredential (the only public entry point into the
// session-refresh path) by controlling readSession / readProjectSession.
// ---------------------------------------------------------------------------

// We need to import resolveCredential + scope helpers
import { resolveCredential } from '../resolve.js';

describe('resolveSessionWithRefresh via resolveCredential — scope-aware persist', () => {
  let originalCwd: () => string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalCwd = process.cwd;
    originalEnv = { ...process.env };
    // Clear auth env vars so stored session path is used
    delete process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_ACCESS_TOKEN;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.cwd = originalCwd;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  // Helper: stub scope.ts so findProjectRoot returns a specific value
  async function withProjectRoot(
    projectRoot: string | null,
    fn: () => Promise<void>
  ): Promise<void> {
    const scopeMod = await import('../../../lib/scope.js');
    const spy = vi.spyOn(scopeMod, 'findProjectRoot').mockReturnValue(projectRoot);
    try {
      await fn();
    } finally {
      spy.mockRestore();
    }
  }

  it('project-scope expired session → writeProjectSession called, writeSession never called', async () => {
    const expiredSession = { accessToken: 'old-at', refreshToken: 'old-rt', expiresAt: 0 };
    vi.spyOn(sessionMod, 'readProjectSession').mockReturnValue(expiredSession);
    vi.spyOn(sessionMod, 'readSession').mockReturnValue(null);
    mockFetch({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 3600 });

    await withProjectRoot('/repo', async () => {
      const result = await resolveCredential({ allowInteractive: false });
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().value).toBe('new-at');
    });

    expect(writeProjectSession).toHaveBeenCalledOnce();
    expect(writeProjectSession).toHaveBeenCalledWith(
      '/repo',
      expect.objectContaining({ accessToken: 'new-at', refreshToken: 'new-rt' })
    );
    expect(writeSession).not.toHaveBeenCalled();
  });

  it('global-scope expired session → writeSession called, writeProjectSession never called', async () => {
    const expiredSession = { accessToken: 'old-at', refreshToken: 'old-rt', expiresAt: 0 };
    vi.spyOn(sessionMod, 'readSession').mockReturnValue(expiredSession);
    mockFetch({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 3600 });

    await withProjectRoot(null, async () => {
      const result = await resolveCredential({ allowInteractive: false });
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().value).toBe('new-at');
    });

    expect(writeSession).toHaveBeenCalledOnce();
    expect(writeSession).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'new-at', refreshToken: 'new-rt' })
    );
    expect(writeProjectSession).not.toHaveBeenCalled();
  });

  it('project-scope refresh does not call readSession or writeSession', async () => {
    const expiredSession = { accessToken: 'old-at', refreshToken: 'old-rt', expiresAt: 0 };
    vi.spyOn(sessionMod, 'readProjectSession').mockReturnValue(expiredSession);
    vi.spyOn(sessionMod, 'readSession').mockReturnValue(null);
    mockFetch({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 3600 });

    await withProjectRoot('/repo', async () => {
      await resolveCredential({ allowInteractive: false });
    });

    // readSession may be called to check global fallback, but writeSession must not
    expect(writeSession).not.toHaveBeenCalled();
  });

  it('global-scope refresh does not call writeProjectSession', async () => {
    const expiredSession = { accessToken: 'old-at', refreshToken: 'old-rt', expiresAt: 0 };
    vi.spyOn(sessionMod, 'readSession').mockReturnValue(expiredSession);
    mockFetch({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 3600 });

    await withProjectRoot(null, async () => {
      await resolveCredential({ allowInteractive: false });
    });

    expect(writeProjectSession).not.toHaveBeenCalled();
  });

  it('refresh token fallback — response omits refresh_token, old token is persisted', async () => {
    const expiredSession = { accessToken: 'old-at', refreshToken: 'old-rt', expiresAt: 0 };
    vi.spyOn(sessionMod, 'readProjectSession').mockReturnValue(expiredSession);
    vi.spyOn(sessionMod, 'readSession').mockReturnValue(null);
    mockFetch({ access_token: 'new-at', expires_in: 3600 }); // no refresh_token

    await withProjectRoot('/repo', async () => {
      await resolveCredential({ allowInteractive: false });
    });

    expect(writeProjectSession).toHaveBeenCalledWith(
      '/repo',
      expect.objectContaining({ refreshToken: 'old-rt' })
    );
  });

  it('skew buffer: expiresAt 45s in the future triggers proactive refresh', async () => {
    const soonSession = {
      accessToken: 'old-at',
      refreshToken: 'old-rt',
      expiresAt: Date.now() + 45_000, // inside 60s buffer
    };
    vi.spyOn(sessionMod, 'readProjectSession').mockReturnValue(soonSession);
    vi.spyOn(sessionMod, 'readSession').mockReturnValue(null);
    mockFetch({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 3600 });

    await withProjectRoot('/repo', async () => {
      const result = await resolveCredential({ allowInteractive: false });
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().value).toBe('new-at');
    });

    expect(global.fetch).toHaveBeenCalled(); // refresh was triggered
  });

  it('skew buffer: expiresAt 90s in the future does NOT trigger refresh', async () => {
    const futureSession = {
      accessToken: 'existing-at',
      refreshToken: 'old-rt',
      expiresAt: Date.now() + 90_000, // outside 60s buffer
    };
    vi.spyOn(sessionMod, 'readProjectSession').mockReturnValue(futureSession);
    vi.spyOn(sessionMod, 'readSession').mockReturnValue(null);
    global.fetch = vi.fn();

    await withProjectRoot('/repo', async () => {
      const result = await resolveCredential({ allowInteractive: false });
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().value).toBe('existing-at');
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('API-key session never calls fetch or disk writes', async () => {
    vi.spyOn(sessionMod, 'readProjectSession').mockReturnValue({ apiKey: 'lin_api_key' });
    global.fetch = vi.fn();

    await withProjectRoot('/repo', async () => {
      const result = await resolveCredential({ allowInteractive: false });
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'lin_api_key' });
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(writeSession).not.toHaveBeenCalled();
    expect(writeProjectSession).not.toHaveBeenCalled();
  });

  it('forceRefresh bypasses expiry guard and refreshes even with valid token', async () => {
    const validSession = {
      accessToken: 'still-valid',
      refreshToken: 'old-rt',
      expiresAt: Date.now() + 3_600_000, // far future
    };
    vi.spyOn(sessionMod, 'readProjectSession').mockReturnValue(validSession);
    vi.spyOn(sessionMod, 'readSession').mockReturnValue(null);
    mockFetch({ access_token: 'force-new-at', refresh_token: 'force-new-rt', expires_in: 3600 });

    await withProjectRoot('/repo', async () => {
      const result = await resolveCredential({ allowInteractive: false, forceRefresh: true });
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().value).toBe('force-new-at');
    });

    expect(global.fetch).toHaveBeenCalled();
    expect(writeProjectSession).toHaveBeenCalledWith(
      '/repo',
      expect.objectContaining({ accessToken: 'force-new-at' })
    );
  });
});
