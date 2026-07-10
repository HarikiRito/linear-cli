import type { LinearClient } from '@linear/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Create a minimal LinearClient mock with only the methods used by resolvers.
 * Typed via `as unknown as LinearClient` since we only need a subset of methods.
 */
function makeClient(
  overrides: Partial<{
    teams: (args?: unknown) => Promise<{ nodes: { id: string; name: string; key?: string }[] }>;
    projects: (args?: unknown) => Promise<{ nodes: { id: string; name: string }[] }>;
    project: (id: string) => Promise<{
      projectMilestones: () => Promise<{ nodes: { id: string; name: string }[] }>;
    } | null>;
    users: (
      args?: unknown
    ) => Promise<{ nodes: { id: string; name: string; displayName?: string; email?: string }[] }>;
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

  // --- H-162: team key resolution (a team's `key`, e.g. "ENG", is distinct from
  // its display `name`, e.g. "Engineering" — both must resolve without a UUID) ---

  it('team key (not matching display name) resolves to ID case-insensitively', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: [{ id: 'tid', key: 'H', name: 'Hariki' }] });
    const client = makeClient({ teams: teamsFn });
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    // "H" does not appear anywhere in "Hariki" as an exact match — only the key matches.
    const result = await resolveTeam('h', client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('tid');
  });

  it('team key resolution is case-insensitive and requires no --team UUID', async () => {
    const teamsFn = vi
      .fn()
      .mockResolvedValue({ nodes: [{ id: 'eng-id', key: 'ENG', name: 'Engineering Team' }] });
    const client = makeClient({ teams: teamsFn });
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveTeam('eng', client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('eng-id');
  });
});

describe('resolveAssignee: name, displayName, and email resolution (H-162)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('resolves by email without requiring a UUID', async () => {
    const usersFn = vi.fn().mockResolvedValue({
      nodes: [{ id: 'user-1', name: 'Alice Anderson', email: 'alice@example.com' }],
    });
    const client = makeClient({ users: usersFn });
    const { resolveAssignee } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveAssignee('alice@example.com', client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('user-1');
  });

  it('resolves by displayName when it differs from name', async () => {
    const usersFn = vi.fn().mockResolvedValue({
      nodes: [{ id: 'user-2', name: 'Robert Smith', displayName: 'bobsmith' }],
    });
    const client = makeClient({ users: usersFn });
    const { resolveAssignee } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveAssignee('bobsmith', client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('user-2');
  });
});

/**
 * "resolveEntity"-style tests from the plan's Test Plan: entity resolution
 * (here, team resolution is the representative case) must try human-readable
 * key/name first, falling back to UUID only when the input already looks like
 * one, and must surface a clear not-found error naming the entity type/value.
 */
describe('resolveEntity: key/name-first resolution with UUID fallback (H-162)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('prefers key/name over UUID for team', async () => {
    const teamsFn = vi
      .fn()
      .mockResolvedValue({ nodes: [{ id: 'team-uuid', key: 'ENG', name: 'Engineering' }] });
    const client = makeClient({ teams: teamsFn });
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveTeam('ENG', client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('team-uuid');
    expect(teamsFn).toHaveBeenCalledOnce();
  });

  it('falls back to UUID when the input already looks like one (key/name lookup skipped)', async () => {
    // A lookup is never even attempted for UUID-shaped input — the entity is
    // used directly, which is the intended "UUID fallback" behaviour.
    const teamsFn = vi.fn().mockResolvedValue({ nodes: [] });
    const client = makeClient({ teams: teamsFn });
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    const uuid = '87654321-4321-4321-4321-210987654321';
    const result = await resolveTeam(uuid, client);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(uuid);
    expect(teamsFn).not.toHaveBeenCalled();
  });

  it('returns a clear not-found error naming the entity type and invalid value', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: [] });
    const client = makeClient({ teams: teamsFn });
    const { resolveTeam } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveTeam('totally-bogus-team', client);
    expect(result.isErr()).toBe(true);
    const e = result._unsafeUnwrapErr();
    expect(e.name).toBe('NotFoundError');
    expect(e.message).toContain('team');
    expect(e.message).toContain('totally-bogus-team');
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

describe('mapIssueNotFoundError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  /**
   * Build a realistic LinearError with a populated `errors[]` array, mirroring
   * the shape produced by the real @linear/sdk LinearGraphQLError/LinearError
   * classes (both have public, assignable `path`/`message`/`errors` fields).
   */
  async function makeStructuredLinearError(path: string[], message: string) {
    const { LinearError, LinearGraphQLError } = await import('@linear/sdk');
    const gqlError = new LinearGraphQLError();
    gqlError.path = path;
    gqlError.message = message;
    const linearError = new LinearError();
    linearError.errors = [gqlError];
    return linearError;
  }

  it('resolves via the structured LinearError.errors[].path when it references the issue entity', async () => {
    const { mapIssueNotFoundError } = await import('../src/features/issues/shared/resolve.js');
    const structuredError = await makeStructuredLinearError(
      ['issue'],
      'Entity not found: Issue - Could not find referenced Issue.'
    );
    const result = mapIssueNotFoundError(structuredError, 'ENG-123');
    expect(result.kind).toBe('NotFoundError');
    expect(result.message).toContain('ENG-123');
  });

  it('does not match a structured LinearError whose path references an unrelated entity (e.g. team)', async () => {
    const { mapIssueNotFoundError } = await import('../src/features/issues/shared/resolve.js');
    const structuredError = await makeStructuredLinearError(
      ['team'],
      'Entity not found: Team - Could not find referenced Team.'
    );
    const result = mapIssueNotFoundError(structuredError, 'ENG-123');
    expect(result.kind).not.toBe('NotFoundError');
  });
});
