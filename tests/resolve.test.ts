import { afterEach, describe, expect, it, vi } from 'vitest';

describe('resolveTeam', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('node ID (UUID) passes through without name search', async () => {
    const requestFn = vi.fn();
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveTeam('12345678-1234-1234-1234-123456789012', requestFn);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('12345678-1234-1234-1234-123456789012');
    expect(requestFn).not.toHaveBeenCalled();
  });

  it('name resolves to ID case-insensitively', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue({ teams: { nodes: [{ id: 'tid', name: 'Engineering' }] } });
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveTeam('engineering', requestFn);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('tid');
  });

  it('ambiguous name returns AmbiguousMatchError with candidates', async () => {
    const requestFn = vi.fn().mockResolvedValue({
      teams: { nodes: [{ id: 't1', name: 'Engineering' }, { id: 't2', name: 'Engineering' }] },
    });
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveTeam('engineering', requestFn);
    expect(result.isErr()).toBe(true);
    const e = result._unsafeUnwrapErr();
    expect(e.name).toBe('AmbiguousMatchError');
    expect(e.message).toContain('t1');
    expect(e.message).toContain('t2');
  });

  it('not found returns NotFoundError with entity type and value', async () => {
    const requestFn = vi.fn().mockResolvedValue({ teams: { nodes: [] } });
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveTeam('nope', requestFn);
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

  it('scopes query to projectId', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue({ project: { milestones: { nodes: [{ id: 'mid', name: 'M1' }] } } });
    const { resolveMilestone } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveMilestone('M1', 'proj-1', requestFn);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('mid');
    const [, vars] = requestFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(vars).toMatchObject({ projectId: 'proj-1' });
  });
});

describe('resolveWorkflowState', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('scopes query to teamId', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue({ team: { states: { nodes: [{ id: 'sid', name: 'In Progress' }] } } });
    const { resolveWorkflowState } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveWorkflowState('In Progress', 'team-1', requestFn);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('sid');
    const [, vars] = requestFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(vars).toMatchObject({ teamId: 'team-1' });
  });
});

describe('resolveCycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('scopes query to teamId', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue({ team: { cycles: { nodes: [{ id: 'cid', name: 'Sprint 5' }] } } });
    const { resolveCycle } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveCycle('Sprint 5', 'team-1', requestFn);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('cid');
    const [, vars] = requestFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(vars).toMatchObject({ teamId: 'team-1' });
  });
});

describe('resolveLabels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns array of IDs for multiple labels', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce({ issueLabels: { nodes: [{ id: 'label-id-1', name: 'bug' }] } })
      .mockResolvedValueOnce({ issueLabels: { nodes: [{ id: 'label-id-2', name: 'feat' }] } });
    const { resolveLabels } = await import('../src/features/issues/shared/resolve.js');
    const r = await resolveLabels(['bug', 'feat'], requestFn);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toEqual(['label-id-1', 'label-id-2']);
  });

  it('propagates NotFoundError for unknown label', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce({ issueLabels: { nodes: [{ id: 'label-id-1', name: 'bug' }] } })
      .mockResolvedValueOnce({ issueLabels: { nodes: [] } });
    const { resolveLabels } = await import('../src/features/issues/shared/resolve.js');
    const r = await resolveLabels(['bug', 'unknown'], requestFn);
    expect(r.isErr()).toBe(true);
    const e = r._unsafeUnwrapErr();
    expect(e.name).toBe('NotFoundError');
    expect(e.message).toContain('unknown');
  });
});
