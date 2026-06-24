import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fix #7: mock session, login and oauth before importing resolve to ensure hermetic tests.
// Without this, tests may fall through to readSession() and hit the real ~/.config/.linear/auth.json

vi.mock('../src/features/auth/session.js', () => ({
  readSession: vi.fn().mockReturnValue(null),
  writeSession: vi.fn().mockReturnValue({ isErr: () => false }),
  deleteSession: vi.fn().mockReturnValue({ isErr: () => false }),
  isApiKeySession: (s: unknown) => typeof s === 'object' && s !== null && 'apiKey' in s,
  isOAuthSession: (s: unknown) => typeof s === 'object' && s !== null && 'accessToken' in s,
  getSessionPath: () => '/tmp/test-linear-cli/auth.json',
}));

vi.mock('../src/features/auth/login.js', () => ({
  runLoginFlow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/features/auth/oauth.js', () => ({
  startOAuthFlow: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

import { resolveCredential } from '../src/features/auth/resolve.js';
import { readSession } from '../src/features/auth/session.js';
import { UnauthenticatedError } from '../src/lib/errors.js';

const mockReadSession = vi.mocked(readSession);

describe('Credential resolution order', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.LINEAR_API_KEY = process.env.LINEAR_API_KEY;
    savedEnv.LINEAR_ACCESS_TOKEN = process.env.LINEAR_ACCESS_TOKEN;
    delete process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_ACCESS_TOKEN;
    // Ensure clean state per test — no session by default
    mockReadSession.mockReturnValue(null);
  });

  afterEach(() => {
    if (savedEnv.LINEAR_API_KEY !== undefined) {
      process.env.LINEAR_API_KEY = savedEnv.LINEAR_API_KEY;
    } else {
      delete process.env.LINEAR_API_KEY;
    }
    if (savedEnv.LINEAR_ACCESS_TOKEN !== undefined) {
      process.env.LINEAR_ACCESS_TOKEN = savedEnv.LINEAR_ACCESS_TOKEN;
    } else {
      delete process.env.LINEAR_ACCESS_TOKEN;
    }
    vi.clearAllMocks();
  });

  it('--api-key flag takes priority over env var', async () => {
    process.env.LINEAR_API_KEY = 'env-key';
    const result = await resolveCredential({ apiKey: 'flag-key', allowInteractive: false });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'flag-key' });
  });

  it('--token flag takes priority over env var', async () => {
    process.env.LINEAR_ACCESS_TOKEN = 'env-token';
    const result = await resolveCredential({ token: 'flag-token', allowInteractive: false });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'accessToken', value: 'flag-token' });
  });

  it('LINEAR_API_KEY env var used when no flag', async () => {
    process.env.LINEAR_API_KEY = 'env-key';
    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'env-key' });
  });

  it('LINEAR_ACCESS_TOKEN env var used when no flag', async () => {
    process.env.LINEAR_ACCESS_TOKEN = 'env-token';
    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'accessToken', value: 'env-token' });
  });

  it('reads apiKey from session file when no flag or env var', async () => {
    mockReadSession.mockReturnValue({ apiKey: 'session-api-key' });
    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'session-api-key' });
  });

  it('reads accessToken from non-expired OAuth session', async () => {
    mockReadSession.mockReturnValue({
      accessToken: 'session-token',
      refreshToken: 'session-refresh',
      expiresAt: Date.now() + 86400000,
    });
    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'accessToken', value: 'session-token' });
  });

  it('returns UnauthenticatedError when no credentials in non-TTY context', async () => {
    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(UnauthenticatedError);
  });

  it('UnauthenticatedError message mentions how to authenticate', async () => {
    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('linear login');
  });
});
