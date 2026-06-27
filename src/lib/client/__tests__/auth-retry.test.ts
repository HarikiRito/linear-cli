import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '../../errors.js';

// ---------------------------------------------------------------------------
// Mock resolveCredential so we can control the credential returned and count
// how many times forceRefresh is used.
// ---------------------------------------------------------------------------

vi.mock('../../../features/auth/resolve.js', () => {
  return {
    resolveCredential: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mock @linear/sdk LinearClient — we only care about client.client.request
// ---------------------------------------------------------------------------

vi.mock('@linear/sdk', () => {
  return {
    LinearClient: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { LinearClient } from '@linear/sdk';
import { okAsync, errAsync } from 'neverthrow';
import { resolveCredential } from '../../../features/auth/resolve.js';
import { getClientWithAuthRetry } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MockLinearClient = LinearClient as unknown as ReturnType<typeof vi.fn>;

/**
 * Build a minimal LinearClient mock whose `client.request` is the given spy.
 * The `client` object is mutable so patches applied by getClientWithAuthRetry
 * take effect (they assign to `gqlClient.request` on this same object).
 */
function makeClientMock(requestFn: ReturnType<typeof vi.fn>): InstanceType<typeof LinearClient> {
  const gqlClient = { request: requestFn };
  return { client: gqlClient } as unknown as InstanceType<typeof LinearClient>;
}

const mockResolveCredential = resolveCredential as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// getClientWithAuthRetry tests
// The patched client's gqlClient.request is called directly to simulate SDK
// method calls and getRequestFn usage in a single unified path.
// ---------------------------------------------------------------------------

describe('getClientWithAuthRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('success path: returns a LinearClient whose gqlClient.request works normally', async () => {
    const request = vi.fn().mockResolvedValue({ viewer: { id: 'u1' } });
    MockLinearClient.mockImplementation(() => makeClientMock(request));

    mockResolveCredential.mockReturnValueOnce(
      okAsync({ type: 'accessToken', value: 'valid-token' })
    );

    const result = await getClientWithAuthRetry({ allowInteractive: false });
    expect(result.isOk()).toBe(true);
    const client = result._unsafeUnwrap();

    const data = await client.client.request({} as never, {});
    expect(data).toEqual({ viewer: { id: 'u1' } });
    expect(mockResolveCredential).toHaveBeenCalledTimes(1);
  });

  it('401 on patched client.request → force-refresh → retry succeeds', async () => {
    const firstRequest = vi.fn().mockRejectedValueOnce(new Error('401 Unauthorized'));
    const secondRequest = vi.fn().mockResolvedValueOnce({ data: 'retried' });

    let callCount = 0;
    MockLinearClient.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeClientMock(firstRequest);
      return makeClientMock(secondRequest);
    });

    mockResolveCredential
      .mockReturnValueOnce(okAsync({ type: 'accessToken', value: 'initial-token' }))
      .mockReturnValueOnce(okAsync({ type: 'accessToken', value: 'fresh-token' }));

    const result = await getClientWithAuthRetry({ allowInteractive: false });
    expect(result.isOk()).toBe(true);
    const client = result._unsafeUnwrap();

    const data = await client.client.request({} as never, {});
    expect(data).toEqual({ data: 'retried' });

    expect(mockResolveCredential).toHaveBeenCalledTimes(2);
    expect(mockResolveCredential.mock.calls[1][0]).toMatchObject({ forceRefresh: true });
    expect(firstRequest).toHaveBeenCalledTimes(1);
    expect(secondRequest).toHaveBeenCalledTimes(1);
  });

  it('401 → refresh → retry also 401: AuthError returned, total requests = 2, no further retry', async () => {
    const firstRequest = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));
    const secondRequest = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));

    let callCount = 0;
    MockLinearClient.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeClientMock(firstRequest);
      return makeClientMock(secondRequest);
    });

    mockResolveCredential
      .mockReturnValueOnce(okAsync({ type: 'accessToken', value: 'initial-token' }))
      .mockReturnValueOnce(okAsync({ type: 'accessToken', value: 'fresh-token' }));

    const result = await getClientWithAuthRetry({ allowInteractive: false });
    const client = result._unsafeUnwrap();

    await expect(client.client.request({} as never, {})).rejects.toBeInstanceOf(AuthError);

    expect(mockResolveCredential).toHaveBeenCalledTimes(2);
    expect(firstRequest).toHaveBeenCalledTimes(1);
    expect(secondRequest).toHaveBeenCalledTimes(1);
  });

  it('HTTP 500 server error via patched client.request does NOT trigger auth refresh', async () => {
    const serverError = new Error('Internal Server Error 500');
    const request = vi.fn().mockRejectedValue(serverError);

    MockLinearClient.mockImplementation(() => makeClientMock(request));

    mockResolveCredential.mockReturnValueOnce(
      okAsync({ type: 'accessToken', value: 'initial-token' })
    );

    const result = await getClientWithAuthRetry({ allowInteractive: false });
    const client = result._unsafeUnwrap();

    await expect(client.client.request({} as never, {})).rejects.toThrow();

    // Only initial resolveCredential — no force-refresh for 500
    expect(mockResolveCredential).toHaveBeenCalledTimes(1);
    expect(mockResolveCredential.mock.calls[0][0]?.forceRefresh).toBeFalsy();
  });

  it('non-auth network error does NOT trigger auth refresh', async () => {
    const networkError = new Error('fetch failed: ECONNREFUSED');
    const request = vi.fn().mockRejectedValue(networkError);

    MockLinearClient.mockImplementation(() => makeClientMock(request));

    mockResolveCredential.mockReturnValueOnce(
      okAsync({ type: 'accessToken', value: 'initial-token' })
    );

    const result = await getClientWithAuthRetry({ allowInteractive: false });
    const client = result._unsafeUnwrap();

    await expect(client.client.request({} as never, {})).rejects.toThrow('fetch failed');

    expect(mockResolveCredential).toHaveBeenCalledTimes(1);
    expect(mockResolveCredential.mock.calls[0][0]?.forceRefresh).toBeFalsy();
  });

  it('401 where refresh fails surfaces AuthError without retrying the original request', async () => {
    const firstRequest = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));
    const secondRequest = vi.fn();

    let callCount = 0;
    MockLinearClient.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeClientMock(firstRequest);
      return makeClientMock(secondRequest);
    });

    mockResolveCredential
      .mockReturnValueOnce(okAsync({ type: 'accessToken', value: 'initial-token' }))
      .mockReturnValueOnce(errAsync(new AuthError('Refresh failed')));

    const result = await getClientWithAuthRetry({ allowInteractive: false });
    const client = result._unsafeUnwrap();

    await expect(client.client.request({} as never, {})).rejects.toBeInstanceOf(AuthError);
    expect(secondRequest).not.toHaveBeenCalled();
  });

  it('after a successful refresh subsequent calls use the fresh client', async () => {
    const firstRequest = vi.fn().mockRejectedValueOnce(new Error('401 Unauthorized'));
    const secondRequest = vi.fn()
      .mockResolvedValueOnce({ data: 'first-retry' })
      .mockResolvedValueOnce({ data: 'second-call' });

    let callCount = 0;
    MockLinearClient.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeClientMock(firstRequest);
      return makeClientMock(secondRequest);
    });

    mockResolveCredential
      .mockReturnValueOnce(okAsync({ type: 'accessToken', value: 'initial-token' }))
      .mockReturnValueOnce(okAsync({ type: 'accessToken', value: 'fresh-token' }));

    const result = await getClientWithAuthRetry({ allowInteractive: false });
    const client = result._unsafeUnwrap();

    // First call → 401 → refresh → retry succeeds
    const data1 = await client.client.request({} as never, {});
    expect(data1).toEqual({ data: 'first-retry' });

    // Second call → uses updated currentRequest (fresh client's request) → no 401
    const data2 = await client.client.request({} as never, {});
    expect(data2).toEqual({ data: 'second-call' });

    // resolveCredential called twice: initial + one force-refresh
    expect(mockResolveCredential).toHaveBeenCalledTimes(2);
  });
});
