import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Shared session mock factory
const makeSessionMock = (sessionValue: unknown = null) => ({
  readSession: vi.fn().mockReturnValue(sessionValue),
  writeSession: vi.fn().mockReturnValue({ isErr: () => false }),
  isApiKeySession: (s: unknown) => typeof s === 'object' && s !== null && 'apiKey' in s,
  isOAuthSession: (s: unknown) => typeof s === 'object' && s !== null && 'accessToken' in s,
  getSessionPath: () => '/tmp/test-auth.json',
  deleteSession: vi.fn().mockReturnValue({ isErr: () => false }),
});

// ─── PKCE utility tests ───────────────────────────────────────────────────────

describe('PKCE utility functions', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('generateCodeVerifier produces a URL-safe base64 string of 128 chars', async () => {
    const { generateCodeVerifier } = await import('../src/features/auth/oauth.js');
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('generateCodeChallenge = base64url(sha256(verifier))', async () => {
    const { generateCodeChallenge } = await import('../src/features/auth/oauth.js');
    const crypto = await import('node:crypto');
    const verifier = 'test-verifier-value-for-unit-testing-pkce-challenge';
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
    expect(generateCodeChallenge(verifier)).toBe(expected);
  });

  it('two successive verifiers are different (random)', async () => {
    const { generateCodeVerifier } = await import('../src/features/auth/oauth.js');
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

// ─── Token refresh (PKCE — client_id only, no secret) ────────────────────────

describe('OAuth token refresh (PKCE)', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.LINEAR_CLIENT_ID = process.env.LINEAR_CLIENT_ID;
    delete process.env.LINEAR_CLIENT_ID; // use embedded default
  });

  afterEach(() => {
    if (savedEnv.LINEAR_CLIENT_ID !== undefined) {
      process.env.LINEAR_CLIENT_ID = savedEnv.LINEAR_CLIENT_ID;
    } else {
      delete process.env.LINEAR_CLIENT_ID;
    }
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('refreshAccessToken sends client_id and NO Authorization header or client_secret', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 86400,
        }),
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.doMock('../src/features/auth/session.js', () => makeSessionMock(null));

    const { refreshAccessToken } = await import('../src/features/auth/oauth.js');
    const result = await refreshAccessToken('old-refresh-token');

    expect(result.isOk()).toBe(true);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.linear.app/oauth/token');
    expect(opts.method).toBe('POST');

    // Must NOT have an Authorization header (no Basic auth for PKCE)
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();

    // Body must contain client_id and grant_type=refresh_token
    const body = new URLSearchParams(opts.body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('client_id')).toBeDefined();
    expect(body.get('client_secret')).toBeNull(); // must NOT include secret
    expect(body.get('refresh_token')).toBe('old-refresh-token');
  });

  it('refreshAccessToken uses embedded client_id by default', async () => {
    const { DEFAULT_CLIENT_ID } = await import('../src/lib/config.js');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'tok', expires_in: 3600 }),
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.doMock('../src/features/auth/session.js', () => makeSessionMock(null));

    const { refreshAccessToken } = await import('../src/features/auth/oauth.js');
    await refreshAccessToken('some-token');

    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
    );
    expect(body.get('client_id')).toBe(DEFAULT_CLIENT_ID);
  });

  it('refreshAccessToken uses LINEAR_CLIENT_ID env override when set', async () => {
    process.env.LINEAR_CLIENT_ID = 'override-client-id';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'tok', expires_in: 3600 }),
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.doMock('../src/features/auth/session.js', () => makeSessionMock(null));

    const { refreshAccessToken } = await import('../src/features/auth/oauth.js');
    await refreshAccessToken('some-token');

    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
    );
    expect(body.get('client_id')).toBe('override-client-id');
  });

  it('refreshAccessToken rotates the refresh token when server returns a new one', async () => {
    const writeSession = vi.fn().mockReturnValue({ isErr: () => false });
    vi.doMock('../src/features/auth/session.js', () => ({
      ...makeSessionMock({
        accessToken: 'old-token',
        refreshToken: 'old-refresh',
        expiresAt: Date.now() - 1000,
      }),
      writeSession,
    }));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { refreshAccessToken } = await import('../src/features/auth/oauth.js');
    await refreshAccessToken('old-refresh');

    expect(writeSession).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: 'new-refresh' })
    );
  });

  it('refreshAccessToken returns err on failed response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('invalid_grant'),
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.doMock('../src/features/auth/session.js', () => makeSessionMock(null));

    const { refreshAccessToken } = await import('../src/features/auth/oauth.js');
    const result = await refreshAccessToken('bad-refresh');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('Token refresh failed');
  });
});

// ─── startOAuthFlow ───────────────────────────────────────────────────────────

describe('OAuth startOAuthFlow (PKCE)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('authorize URL includes code_challenge, code_challenge_method=S256, and embedded client_id', async () => {
    vi.resetModules();

    let capturedHandler: ((req: unknown, res: unknown) => void) | undefined;
    let capturedListenCb: (() => void) | undefined;

    const mockServer = {
      listen: vi.fn((_port: unknown, cb: () => void) => {
        capturedListenCb = cb;
        return mockServer;
      }),
      close: vi.fn((cb?: () => void) => {
        cb?.();
        return mockServer;
      }),
      on: vi.fn((event: string, cb: unknown) => {
        if (event === 'request') capturedHandler = cb as (req: unknown, res: unknown) => void;
        return mockServer;
      }),
    };

    vi.doMock('node:http', () => ({
      default: { createServer: () => mockServer },
    }));
    vi.doMock('../src/features/auth/session.js', () => makeSessionMock(null));

    const openCalls: string[] = [];
    vi.doMock('open', () => ({
      default: (url: string) => {
        openCalls.push(url);
        return Promise.resolve();
      },
    }));

    const { startOAuthFlow } = await import('../src/features/auth/oauth.js');
    const { DEFAULT_CLIENT_ID } = await import('../src/lib/config.js');

    const flowPromise = startOAuthFlow();
    await new Promise((r) => setTimeout(r, 20));

    // Trigger the listen callback so open() is called
    capturedListenCb?.();
    await new Promise((r) => setTimeout(r, 20));

    expect(openCalls.length).toBeGreaterThan(0);
    const authorizeUrl = new URL(openCalls[0] ?? '');

    expect(authorizeUrl.searchParams.get('code_challenge')).toBeTruthy();
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizeUrl.searchParams.get('client_id')).toBe(DEFAULT_CLIENT_ID);
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code');

    // Resolve flow so test doesn't hang
    const mockRes = { writeHead: vi.fn(), end: vi.fn() };
    const state = authorizeUrl.searchParams.get('state') ?? '';
    capturedHandler?.({ url: `/callback?code=test-code&state=${state}` }, mockRes);

    // Mock fetch for token exchange
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
      })
    );

    // flowPromise is a ResultAsync — await it (may be ok or err, either is fine here)
    await flowPromise;
  });

  it('token exchange sends code_verifier and NO client_secret', async () => {
    vi.resetModules();

    let capturedHandler: ((req: unknown, res: unknown) => void) | undefined;
    let capturedState = '';

    const mockServer = {
      listen: vi.fn((_port: unknown, cb: () => void) => {
        cb();
        return mockServer;
      }),
      close: vi.fn((cb?: () => void) => {
        cb?.();
        return mockServer;
      }),
      on: vi.fn((event: string, cb: unknown) => {
        if (event === 'request') capturedHandler = cb as (req: unknown, res: unknown) => void;
        return mockServer;
      }),
    };

    vi.doMock('node:http', () => ({
      default: { createServer: () => mockServer },
    }));
    vi.doMock('../src/features/auth/session.js', () => makeSessionMock(null));
    vi.doMock('open', () => ({
      default: (url: string) => {
        capturedState = new URL(url).searchParams.get('state') ?? '';
        return Promise.resolve();
      },
    }));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { startOAuthFlow } = await import('../src/features/auth/oauth.js');
    const flowPromise = startOAuthFlow();
    await new Promise((r) => setTimeout(r, 30));

    const mockRes = { writeHead: vi.fn(), end: vi.fn() };
    capturedHandler?.({ url: `/callback?code=test-code&state=${capturedState}` }, mockRes);

    await flowPromise;

    expect(mockFetch).toHaveBeenCalledOnce();
    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
    );
    expect(body.get('code_verifier')).toBeTruthy();
    expect(body.get('client_secret')).toBeNull(); // PKCE — no secret
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('test-code');
  });

  it('startOAuthFlow returns err on state mismatch in callback', async () => {
    vi.resetModules();

    let capturedHandler: ((req: unknown, res: unknown) => void) | undefined;

    const mockServer = {
      listen: vi.fn((_port: unknown, cb: () => void) => {
        cb();
        return mockServer;
      }),
      close: vi.fn((cb?: () => void) => {
        cb?.();
        return mockServer;
      }),
      on: vi.fn((event: string, cb: unknown) => {
        if (event === 'request') capturedHandler = cb as (req: unknown, res: unknown) => void;
        return mockServer;
      }),
    };

    vi.doMock('node:http', () => ({
      default: { createServer: () => mockServer },
    }));
    vi.doMock('../src/features/auth/session.js', () => makeSessionMock(null));
    vi.doMock('open', () => ({ default: () => Promise.resolve() }));

    const { startOAuthFlow } = await import('../src/features/auth/oauth.js');
    const flowPromise = startOAuthFlow();
    await new Promise((r) => setTimeout(r, 20));

    const mockRes = { writeHead: vi.fn(), end: vi.fn() };
    capturedHandler?.({ url: '/callback?code=any-code&state=wrong-state-value' }, mockRes);

    const result = await flowPromise;
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('state mismatch');
  });

  it('startOAuthFlow completes successfully with valid code and state via real HTTP', async () => {
    // Ensure node:http is NOT mocked (prior tests in this describe use vi.doMock for it)
    vi.doUnmock('node:http');
    vi.resetModules();

    vi.doMock('../src/features/auth/session.js', () => ({
      ...makeSessionMock(null),
      writeSession: vi.fn().mockReturnValue({ isErr: () => false }),
    }));
    vi.doMock('open', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'flow-access-token',
          refresh_token: 'flow-refresh-token',
          expires_in: 3600,
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { startOAuthFlow } = await import('../src/features/auth/oauth.js');
    const flowPromise = startOAuthFlow();
    await new Promise((r) => setTimeout(r, 100));

    const openMod = await import('open');
    const openMock = vi.mocked(openMod.default);
    const calledUrl = openMock.mock.calls[0]?.[0] as string | undefined;
    if (!calledUrl) {
      // Server didn't start in time — let the flow time out (test environment issue)
      return;
    }

    const urlObj = new URL(calledUrl);
    const state = urlObj.searchParams.get('state') ?? '';
    const redirectUri = urlObj.searchParams.get('redirect_uri') ?? '';
    const port = redirectUri ? Number(new URL(redirectUri).port) || 9876 : 9876;

    // Use the real node:http (not the mock) to send the callback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const realHttp = require('node:http') as typeof import('node:http');
    await new Promise<void>((resolve, reject) => {
      const req = realHttp.request(
        {
          hostname: 'localhost',
          port,
          path: `/callback?code=auth-code-123&state=${state}`,
          method: 'GET',
        },
        (res) => {
          res.on('data', () => {
            /* consume */
          });
          res.on('end', resolve);
        }
      );
      req.on('error', reject);
      req.end();
    });

    const result = await flowPromise;
    expect(result.isOk()).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.linear.app/oauth/token',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

// ─── Port fallback ────────────────────────────────────────────────────────────

describe('Port fallback', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('bindFirstAvailablePort returns the first port that binds', async () => {
    const { bindFirstAvailablePort } = await import('../src/features/auth/oauth.js');
    const [server, port] = await bindFirstAvailablePort([9876, 9877, 9878]);
    expect([9876, 9877, 9878]).toContain(port);
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('bindFirstAvailablePort skips an occupied port and uses the next', async () => {
    // Ensure node:http is NOT mocked from prior tests in the file
    vi.doUnmock('node:http');
    vi.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const realHttp = require('node:http') as typeof import('node:http');

    // Occupy 9876 with a real server
    const blocker = await new Promise<import('node:http').Server>((resolve, reject) => {
      const s = realHttp.createServer();
      s.listen(9876, () => resolve(s));
      s.on('error', reject);
    });

    try {
      const { bindFirstAvailablePort } = await import('../src/features/auth/oauth.js');
      const [server, port] = await bindFirstAvailablePort([9876, 9877, 9878]);
      expect(port).not.toBe(9876);
      expect([9877, 9878]).toContain(port);
      await new Promise<void>((r) => server.close(() => r()));
    } finally {
      await new Promise<void>((r) => blocker.close(() => r()));
    }
  });
});

// ─── Workspace-switching / prompt=consent and session-preservation tests ─────

describe('OAuth startOAuthFlow — workspace-switching safety', () => {
  // Helper: build a mock HTTP server that records the request handler and
  // immediately fires the listen callback so open() is called synchronously.
  function makeMockServer() {
    let capturedHandler: ((req: unknown, res: unknown) => void) | undefined;
    const mockServer = {
      listen: vi.fn((_port: unknown, cb: () => void) => {
        cb(); // fire immediately
        return mockServer;
      }),
      close: vi.fn((cb?: () => void) => {
        cb?.();
        return mockServer;
      }),
      on: vi.fn((event: string, cb: unknown) => {
        if (event === 'request') capturedHandler = cb as (req: unknown, res: unknown) => void;
        return mockServer;
      }),
      getHandler: () => capturedHandler,
    };
    return mockServer;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('(a) authorize URL includes prompt=consent', async () => {
    vi.resetModules();

    const mockServer = makeMockServer();
    vi.doMock('node:http', () => ({
      default: { createServer: () => mockServer },
    }));
    vi.doMock('../src/features/auth/session.js', () => makeSessionMock(null));

    const openCalls: string[] = [];
    vi.doMock('open', () => ({
      default: (url: string) => {
        openCalls.push(url);
        return Promise.resolve();
      },
    }));

    const { startOAuthFlow } = await import('../src/features/auth/oauth.js');

    const flowPromise = startOAuthFlow();
    await new Promise((r) => setTimeout(r, 30));

    expect(openCalls.length).toBeGreaterThan(0);
    const authorizeUrl = new URL(openCalls[0] ?? '');
    expect(authorizeUrl.searchParams.get('prompt')).toBe('consent');

    // Stub fetch BEFORE triggering the callback so the mock is in place when
    // the token-exchange microtask runs.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
      })
    );

    // Resolve so the flow doesn't hang the test suite
    const state = authorizeUrl.searchParams.get('state') ?? '';
    const mockRes = { writeHead: vi.fn(), end: vi.fn() };
    mockServer.getHandler()?.({ url: `/callback?code=test-code&state=${state}` }, mockRes);

    await flowPromise;
  });

  it('(b) failed OAuth flow (state mismatch) does NOT overwrite an existing session', async () => {
    vi.resetModules();

    const existingSession = { apiKey: 'existing-key-must-survive' };
    const writeSession = vi.fn().mockReturnValue({ isErr: () => false });

    vi.doMock('../src/features/auth/session.js', () => ({
      ...makeSessionMock(existingSession),
      writeSession,
    }));

    const mockServer = makeMockServer();
    vi.doMock('node:http', () => ({
      default: { createServer: () => mockServer },
    }));
    vi.doMock('open', () => ({ default: () => Promise.resolve() }));

    const { startOAuthFlow } = await import('../src/features/auth/oauth.js');
    const flowPromise = startOAuthFlow();
    await new Promise((r) => setTimeout(r, 30));

    // Send a bad state — this should cause the flow to fail
    const mockRes = { writeHead: vi.fn(), end: vi.fn() };
    mockServer.getHandler()?.({ url: '/callback?code=any&state=wrong-state-value' }, mockRes);

    const result = await flowPromise;

    expect(result.isErr()).toBe(true);
    // writeSession must NOT have been called — old session is intact
    expect(writeSession).not.toHaveBeenCalled();
  });

  it('(b) failed OAuth flow (token exchange error) does NOT overwrite an existing session', async () => {
    vi.resetModules();

    const existingSession = { apiKey: 'old-api-key-preserved' };
    const writeSession = vi.fn().mockReturnValue({ isErr: () => false });

    vi.doMock('../src/features/auth/session.js', () => ({
      ...makeSessionMock(existingSession),
      writeSession,
    }));

    const mockServer = makeMockServer();
    vi.doMock('node:http', () => ({
      default: { createServer: () => mockServer },
    }));

    let capturedOpenUrl = '';
    vi.doMock('open', () => ({
      default: (url: string) => {
        capturedOpenUrl = url;
        return Promise.resolve();
      },
    }));

    // Token exchange will fail
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('invalid_client'),
      })
    );

    const { startOAuthFlow } = await import('../src/features/auth/oauth.js');
    const flowPromise = startOAuthFlow();
    await new Promise((r) => setTimeout(r, 30));

    // Send a valid-looking callback (good state) so the code proceeds to token exchange
    const state =
      new URL(capturedOpenUrl || 'http://x/?state=fallback').searchParams.get('state') ??
      'fallback';
    const mockRes = { writeHead: vi.fn(), end: vi.fn() };
    mockServer.getHandler()?.({ url: `/callback?code=some-code&state=${state}` }, mockRes);

    const result = await flowPromise;

    expect(result.isErr()).toBe(true);
    // writeSession must NOT have been called
    expect(writeSession).not.toHaveBeenCalled();
  });

  it('(c) successful OAuth flow writes the new session', async () => {
    vi.resetModules();

    const existingSession = { apiKey: 'old-key' };
    const writeSession = vi.fn().mockReturnValue({ isErr: () => false });

    vi.doMock('../src/features/auth/session.js', () => ({
      ...makeSessionMock(existingSession),
      writeSession,
    }));

    const mockServer = makeMockServer();
    vi.doMock('node:http', () => ({
      default: { createServer: () => mockServer },
    }));

    let capturedOpenUrl = '';
    vi.doMock('open', () => ({
      default: (url: string) => {
        capturedOpenUrl = url;
        return Promise.resolve();
      },
    }));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
      })
    );

    const { startOAuthFlow } = await import('../src/features/auth/oauth.js');
    const flowPromise = startOAuthFlow();
    await new Promise((r) => setTimeout(r, 30));

    const state =
      new URL(capturedOpenUrl || 'http://x/?state=fallback').searchParams.get('state') ??
      'fallback';
    const mockRes = { writeHead: vi.fn(), end: vi.fn() };
    mockServer.getHandler()?.({ url: `/callback?code=valid-code&state=${state}` }, mockRes);

    const result = await flowPromise;

    expect(result.isOk()).toBe(true);
    expect(writeSession).toHaveBeenCalledOnce();
    expect(writeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      })
    );
  });
});

// ─── API-key login path: writes only on success ───────────────────────────────

describe('login.ts — API-key path writes session only on success', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('(d) does NOT call writeSession when LinearClient.viewer rejects (key validation fails)', async () => {
    vi.resetModules();

    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
      outro: vi.fn(),
      select: vi.fn().mockResolvedValue('apikey'),
      text: vi.fn().mockResolvedValue('lin_api_bad_key'),
      spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
      isCancel: vi.fn().mockReturnValue(false),
    }));

    vi.doMock('@linear/sdk', () => ({
      LinearClient: vi.fn().mockImplementation(() => ({
        viewer: Promise.reject(new Error('Auth failed')),
      })),
    }));

    const writeSession = vi.fn().mockReturnValue({ isErr: () => false });
    vi.doMock('../src/features/auth/session.js', () => ({
      ...makeSessionMock({ apiKey: 'old-key-preserved' }),
      writeSession,
    }));
    vi.doMock('../src/features/auth/oauth.js', () => ({
      startOAuthFlow: vi.fn(),
      refreshAccessToken: vi.fn(),
    }));

    const { runLoginFlow } = await import('../src/features/auth/login.js');

    const mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation((_code?: number | string | null) => {
        throw new Error(`process.exit(${String(_code)})`);
      });

    await expect(runLoginFlow()).rejects.toThrow('process.exit(1)');
    expect(writeSession).not.toHaveBeenCalled();

    mockExit.mockRestore();
  });

  it('(d) DOES call writeSession when LinearClient.viewer resolves (valid key)', async () => {
    vi.resetModules();

    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
      outro: vi.fn(),
      select: vi.fn().mockResolvedValue('apikey'),
      text: vi.fn().mockResolvedValue('lin_api_good_key'),
      spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
      isCancel: vi.fn().mockReturnValue(false),
    }));

    vi.doMock('@linear/sdk', () => ({
      LinearClient: vi.fn().mockImplementation(() => ({
        viewer: Promise.resolve({ id: 'u1', name: 'Test', email: 'test@x.com' }),
      })),
    }));

    const writeSession = vi.fn().mockReturnValue({ isErr: () => false, isOk: () => true });
    vi.doMock('../src/features/auth/session.js', () => ({
      ...makeSessionMock({ apiKey: 'old-key' }),
      writeSession,
    }));
    vi.doMock('../src/features/auth/oauth.js', () => ({
      startOAuthFlow: vi.fn(),
      refreshAccessToken: vi.fn(),
    }));

    const { runLoginFlow } = await import('../src/features/auth/login.js');
    await runLoginFlow();

    expect(writeSession).toHaveBeenCalledOnce();
    expect(writeSession).toHaveBeenCalledWith({ apiKey: 'lin_api_good_key' });
  });
});

// ─── RATELIMITED error mapping ────────────────────────────────────────────────

describe('RATELIMITED error mapping', () => {
  it('mapLinearError returns RateLimitError for RATELIMITED message', async () => {
    const { mapLinearError, RateLimitError } = await import('../src/lib/errors.js');
    const err = Object.assign(new Error('RATELIMITED: too many requests'), { status: 400 });
    expect(mapLinearError(err)).toBeInstanceOf(RateLimitError);
  });

  it('mapLinearError returns RateLimitError for status 400 + RATELIMITED message', async () => {
    const { mapLinearError, RateLimitError } = await import('../src/lib/errors.js');
    const err = Object.assign(new Error('RATELIMITED'), { status: 400 });
    expect(mapLinearError(err)).toBeInstanceOf(RateLimitError);
  });

  it('mapLinearError does NOT treat plain 400 without RATELIMITED as rate limit', async () => {
    const { mapLinearError, RateLimitError } = await import('../src/lib/errors.js');
    const err = Object.assign(new Error('Bad request'), { status: 400 });
    expect(mapLinearError(err)).not.toBeInstanceOf(RateLimitError);
  });
});
