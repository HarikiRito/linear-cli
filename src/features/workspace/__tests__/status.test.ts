import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, NetworkError } from '../../../lib/errors.js';

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn(),
}));

vi.mock('../../auth/resolve.js', () => ({
  resolveSessionWithRefresh: vi.fn(),
}));

import { LinearClient } from '@linear/sdk';
import { resolveSessionWithRefresh } from '../../auth/resolve.js';
import { resolveWorkspaceStatus, sessionToCredential } from '../status.js';

const MockLinearClient = vi.mocked(LinearClient);
const mockResolveSessionWithRefresh = vi.mocked(resolveSessionWithRefresh);

describe('sessionToCredential', () => {
  it('maps an apiKey session', () => {
    expect(sessionToCredential({ apiKey: 'k' })).toEqual({ type: 'apiKey', value: 'k' });
  });

  it('maps an OAuth session to its access token', () => {
    expect(sessionToCredential({ accessToken: 'at', refreshToken: 'rt', expiresAt: 0 })).toEqual({
      type: 'accessToken',
      value: 'at',
    });
  });
});

describe('resolveWorkspaceStatus — apiKey sessions (no refresh concept)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('valid: org probe succeeds', async () => {
    MockLinearClient.mockImplementation(
      () =>
        ({
          organization: Promise.resolve({ id: 'ws-1', name: 'Acme', urlKey: 'acme' }),
        }) as unknown as InstanceType<typeof LinearClient>
    );

    const info = await resolveWorkspaceStatus('ws-1', { apiKey: 'key' });

    expect(info).toEqual({
      id: 'ws-1',
      name: 'Acme',
      urlKey: 'acme',
      state: 'valid',
      credential: { type: 'apiKey', value: 'key' },
    });
  });

  it('invalid: org probe fails with a genuine auth error, no credential returned', async () => {
    MockLinearClient.mockImplementation(
      () =>
        ({
          get organization() {
            return Promise.reject(new Error('401 Unauthorized'));
          },
        }) as unknown as InstanceType<typeof LinearClient>
    );

    const info = await resolveWorkspaceStatus('ws-1', { apiKey: 'bad' });

    expect(info.state).toBe('invalid');
    expect(info.credential).toBeUndefined();
  });

  it('unreachable: org probe fails with a network error, raw credential preserved', async () => {
    MockLinearClient.mockImplementation(
      () =>
        ({
          get organization() {
            return Promise.reject(new Error('fetch failed'));
          },
        }) as unknown as InstanceType<typeof LinearClient>
    );

    const info = await resolveWorkspaceStatus('ws-1', { apiKey: 'flaky' });

    expect(info.state).toBe('unreachable');
    expect(info.credential).toEqual({ type: 'apiKey', value: 'flaky' });
  });
});

describe('resolveWorkspaceStatus — OAuth sessions (H-642 refresh-aware)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('valid: not expired, refresh not needed, org probe succeeds', async () => {
    mockResolveSessionWithRefresh.mockReturnValue(
      ok({ type: 'accessToken', value: 'at' }) as unknown as ReturnType<
        typeof resolveSessionWithRefresh
      >
    );
    MockLinearClient.mockImplementation(
      () =>
        ({
          organization: Promise.resolve({ id: 'ws-1', name: 'Acme', urlKey: 'acme' }),
        }) as unknown as InstanceType<typeof LinearClient>
    );

    const info = await resolveWorkspaceStatus('ws-1', {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3_600_000,
    });

    expect(info.state).toBe('valid');
  });

  it('expired-refreshable: was expired, refresh + org probe succeed', async () => {
    mockResolveSessionWithRefresh.mockReturnValue(
      ok({ type: 'accessToken', value: 'new-at' }) as unknown as ReturnType<
        typeof resolveSessionWithRefresh
      >
    );
    MockLinearClient.mockImplementation(
      () =>
        ({
          organization: Promise.resolve({ id: 'ws-1', name: 'Acme', urlKey: 'acme' }),
        }) as unknown as InstanceType<typeof LinearClient>
    );

    const info = await resolveWorkspaceStatus('ws-1', {
      accessToken: 'old-at',
      refreshToken: 'rt',
      expiresAt: Date.now() - 1000,
    });

    expect(info.state).toBe('expired-refreshable');
    expect(info.credential).toEqual({ type: 'accessToken', value: 'new-at' });
  });

  it('invalid: refresh fails with AuthError (invalid_grant/401) — no credential', async () => {
    mockResolveSessionWithRefresh.mockReturnValue(
      err(new AuthError('Token refresh failed: invalid_grant')) as unknown as ReturnType<
        typeof resolveSessionWithRefresh
      >
    );

    const info = await resolveWorkspaceStatus('ws-1', {
      accessToken: 'old-at',
      refreshToken: 'dead-rt',
      expiresAt: Date.now() - 1000,
    });

    expect(info.state).toBe('invalid');
    expect(info.credential).toBeUndefined();
  });

  it('unreachable: refresh fails with NetworkError — raw stored token preserved as a fallback credential', async () => {
    mockResolveSessionWithRefresh.mockReturnValue(
      err(new NetworkError('fetch failed')) as unknown as ReturnType<
        typeof resolveSessionWithRefresh
      >
    );

    const info = await resolveWorkspaceStatus('ws-1', {
      accessToken: 'stale-at',
      refreshToken: 'rt',
      expiresAt: Date.now() - 1000,
    });

    expect(info.state).toBe('unreachable');
    expect(info.credential).toEqual({ type: 'accessToken', value: 'stale-at' });
  });

  it('unreachable: refresh succeeds but the org probe itself fails transiently', async () => {
    mockResolveSessionWithRefresh.mockReturnValue(
      ok({ type: 'accessToken', value: 'new-at' }) as unknown as ReturnType<
        typeof resolveSessionWithRefresh
      >
    );
    MockLinearClient.mockImplementation(
      () =>
        ({
          get organization() {
            return Promise.reject(new Error('fetch failed'));
          },
        }) as unknown as InstanceType<typeof LinearClient>
    );

    const info = await resolveWorkspaceStatus('ws-1', {
      accessToken: 'old-at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3_600_000,
    });

    expect(info.state).toBe('unreachable');
    expect(info.credential).toEqual({ type: 'accessToken', value: 'new-at' });
  });
});
