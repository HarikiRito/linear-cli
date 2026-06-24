import type { LinearClient } from '@linear/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeClient(
  overrides: Partial<{
    viewer: Promise<{ id: string; name: string }>;
    users: (args?: unknown) => Promise<{ nodes: { id: string; name: string }[] }>;
  }>
): LinearClient {
  return overrides as unknown as LinearClient;
}

describe('resolveAssignee "me"', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('calls client.viewer and returns viewer id', async () => {
    const viewerPromise = Promise.resolve({ id: 'viewer-uuid', name: 'Test User' });
    const usersFn = vi.fn();
    const client = makeClient({ viewer: viewerPromise, users: usersFn });
    const { resolveAssignee } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveAssignee('me', client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('viewer-uuid');
    expect(usersFn).not.toHaveBeenCalled();
  });

  it('viewer call failure propagates as error', async () => {
    // Use a getter so the rejected promise is only created when accessed,
    // avoiding an unhandled rejection before the test consumes it.
    const client = {
      get viewer() {
        return Promise.reject(new Error('unauthorized'));
      },
    } as unknown as LinearClient;
    const { resolveAssignee } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveAssignee('me', client);
    expect(result.isErr()).toBe(true);
  });

  it('UUID passes through without viewer call', async () => {
    const viewerFn = vi.fn();
    const usersFn = vi.fn();
    const client = makeClient({ users: usersFn });
    // Override viewer as a property
    Object.defineProperty(client, 'viewer', { get: viewerFn });
    const { resolveAssignee } = await import('../src/features/issues/shared/resolve.js');
    const uuid = '12345678-1234-1234-1234-123456789012';
    const result = await resolveAssignee(uuid, client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(uuid);
    expect(viewerFn).not.toHaveBeenCalled();
    expect(usersFn).not.toHaveBeenCalled();
  });

  it('name still resolves by users search, no viewer call', async () => {
    const usersFn = vi.fn().mockResolvedValue({ nodes: [{ id: 'alice-id', name: 'Alice' }] });
    const viewerFn = vi.fn();
    const client = makeClient({ users: usersFn });
    Object.defineProperty(client, 'viewer', { get: viewerFn });
    const { resolveAssignee } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveAssignee('Alice', client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('alice-id');
    expect(viewerFn).not.toHaveBeenCalled();
    expect(usersFn).toHaveBeenCalled();
  });
});
