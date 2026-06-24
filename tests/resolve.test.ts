import type { LinearClient } from '@linear/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Create a minimal LinearClient mock with only the methods used by resolvers.
 * Typed via `as unknown as LinearClient` since we only need a subset of methods.
 */
function makeClient(
  overrides: Partial<{
    teams: (args?: unknown) => Promise<{ nodes: { id: string; name: string }[] }>;
    projects: (args?: unknown) => Promise<{ nodes: { id: string; name: string }[] }>;
    project: (id: string) => Promise<{
      projectMilestones: () => Promise<{ nodes: { id: string; name: string }[] }>;
    } | null>;
    users: (args?: unknown) => Promise<{ nodes: { id: string; name: string }[] }>;
    issueLabels: (args?: unknown) => Promise<{ nodes: { id: string; name: string }[] }>;
    workflowStates: (args?: unknown) => Promise<{ nodes: { id: string; name: string }[] }>;
    cycles: (args?: unknown) => Promise<{ nodes: { id: string; name?: string }[] }>;
  }>
): LinearClient {
  return overrides as unknown as LinearClient;
}

describe('resolveTeam', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('node ID (UUID) passes through without name search', async () => {
    const client = makeClient({ teams: vi.fn() });
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveTeam('12345678-1234-1234-1234-123456789012', client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('12345678-1234-1234-1234-123456789012');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.teams).not.toHaveBeenCalled();
  });

  it('name resolves to ID case-insensitively', async () => {
    const client = makeClient({
      teams: vi.fn().mockResolvedValue({ nodes: [{ id: 'tid', name: 'Engineering' }] }),
    });
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveTeam('engineering', client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('tid');
  });

  it('ambiguous name returns AmbiguousMatchError with candidates', async () => {
    const client = makeClient({
      teams: vi.fn().mockResolvedValue({
        nodes: [
          { id: 't1', name: 'Engineering' },
          { id: 't2', name: 'Engineering' },
        ],
      }),
    });
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveTeam('engineering', client);
    expect(result.isErr()).toBe(true);
    const e = result._unsafeUnwrapErr();
    expect(e.name).toBe('AmbiguousMatchError');
    expect(e.message).toContain('t1');
    expect(e.message).toContain('t2');
  });

  it('not found returns NotFoundError with entity type and value', async () => {
    const client = makeClient({
      teams: vi.fn().mockResolvedValue({ nodes: [] }),
    });
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveTeam('nope', client);
    expect(result.isErr()).toBe(true);
    const e = result._unsafeUnwrapErr();
    expect(e.name).toBe('NotFoundError');
    expect(e.message).toContain('team');
    expect(e.message).toContain('nope');
  });
});

describe('resolveMilestone', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('scopes query to projectId via single raw GraphQL query', async () => {
    const requestFn = vi.fn().mockResolvedValue({
      project: {
        projectMilestones: {
          nodes: [{ id: 'mid', name: 'M1' }],
        },
      },
    });
    vi.doMock('../src/lib/client/index.js', () => ({
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    const client = makeClient({});
    const { resolveMilestone } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveMilestone('M1', 'proj-1', client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('mid');
    expect(requestFn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ id: 'proj-1' })
    );
  });
});

describe('resolveWorkflowState', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('scopes query to teamId', async () => {
    const workflowStatesFn = vi
      .fn()
      .mockResolvedValue({ nodes: [{ id: 'sid', name: 'In Progress' }] });
    const client = makeClient({ workflowStates: workflowStatesFn });
    const { resolveWorkflowState } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveWorkflowState('In Progress', 'team-1', client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('sid');
    expect(workflowStatesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({ team: { id: { eq: 'team-1' } } }),
      })
    );
  });
});

describe('resolveCycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('scopes query to teamId', async () => {
    const cyclesFn = vi.fn().mockResolvedValue({ nodes: [{ id: 'cid', name: 'Sprint 5' }] });
    const client = makeClient({ cycles: cyclesFn });
    const { resolveCycle } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveCycle('Sprint 5', 'team-1', client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('cid');
    expect(cyclesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({ team: { id: { eq: 'team-1' } } }),
      })
    );
  });
});

describe('resolveLabels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns array of IDs for multiple labels', async () => {
    const issuelabelsFn = vi
      .fn()
      .mockResolvedValueOnce({ nodes: [{ id: 'label-id-1', name: 'bug' }] })
      .mockResolvedValueOnce({ nodes: [{ id: 'label-id-2', name: 'feat' }] });
    const client = makeClient({ issueLabels: issuelabelsFn });
    const { resolveLabels } = await import('../src/features/issues/shared/resolve.js');
    const r = await resolveLabels(['bug', 'feat'], client);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toEqual(['label-id-1', 'label-id-2']);
  });

  it('propagates NotFoundError for unknown label', async () => {
    const issuelabelsFn = vi
      .fn()
      .mockResolvedValueOnce({ nodes: [{ id: 'label-id-1', name: 'bug' }] })
      .mockResolvedValueOnce({ nodes: [] });
    const client = makeClient({ issueLabels: issuelabelsFn });
    const { resolveLabels } = await import('../src/features/issues/shared/resolve.js');
    const r = await resolveLabels(['bug', 'unknown'], client);
    expect(r.isErr()).toBe(true);
    const e = r._unsafeUnwrapErr();
    expect(e.name).toBe('NotFoundError');
    expect(e.message).toContain('unknown');
  });
});
