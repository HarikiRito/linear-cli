import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Make a minimal issue mock with lazy getters for state.
 * The SDK returns issue.state as a lazy getter → Promise<WorkflowState>.
 */
function makeIssueMock(stateName = 'Todo') {
  const stateMock = { name: stateName };
  return {
    id: 'uuid-1',
    identifier: 'ISSUE-1',
    title: 'Test Issue',
    url: 'https://linear.app/issue/ISSUE-1',
    get state() {
      return Promise.resolve(stateMock);
    },
  };
}

function makePayloadMock(issueMock = makeIssueMock()) {
  return {
    get issue() {
      return Promise.resolve(issueMock);
    },
  };
}

/**
 * Build a fake LinearClient with the given method overrides.
 * SDK resolvers (resolveTeam, resolveLabel, etc.) call client.teams(),
 * client.issueLabels(), client.workflowStates(), etc. directly.
 */
function makeClientMock(overrides: Record<string, unknown>) {
  return overrides;
}

function stdMocks(clientMock: ReturnType<typeof makeClientMock>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok(clientMock)),
    getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
    getRequestFn: vi.fn(),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn().mockReturnValue(''),
    printTable: vi.fn(),
  }));
  vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
}

async function buildProgram() {
  const { registerIssues } = await import('../src/features/issues/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerIssues(program);
  return program;
}

// ---------------------------------------------------------------------------
// issues create
// ---------------------------------------------------------------------------
describe('issues create', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls issueCreate with resolved teamId and title', async () => {
    const createIssueFn = vi.fn().mockResolvedValue(makePayloadMock());
    const teamsFn = vi
      .fn()
      .mockResolvedValue({ nodes: [{ id: 'team-uuid', name: 'Engineering' }] });
    const clientMock = makeClientMock({ createIssue: createIssueFn, teams: teamsFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'create',
      '--title',
      'Foo',
      '--team',
      'Engineering',
    ]);

    expect(createIssueFn).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-uuid', title: 'Foo' })
    );
  });

  it('missing --title causes Commander error before any network call', async () => {
    const clientMock = makeClientMock({});
    stdMocks(clientMock);
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'issues', 'create', '--team', 'eng'])
    ).rejects.toThrow();
  });

  it('missing --team causes Commander error before any network call', async () => {
    const clientMock = makeClientMock({});
    stdMocks(clientMock);
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'issues', 'create', '--title', 'Foo'])
    ).rejects.toThrow();
  });

  it('priority 5 is rejected before any network call', async () => {
    const createIssueFn = vi.fn();
    const exitErrorMock = vi.fn();
    const clientMock = makeClientMock({ createIssue: createIssueFn });
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok(clientMock)),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildProgram();
    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'create',
      '--title',
      'T',
      '--team',
      'eng',
      '--priority',
      '5',
    ]);

    expect(exitErrorMock).toHaveBeenCalled();
    // No network call at all (priority validated first)
    expect(createIssueFn).not.toHaveBeenCalled();
  });

  it('priority 0 is accepted and passed to mutation', async () => {
    const createIssueFn = vi.fn().mockResolvedValue(makePayloadMock());
    const teamsFn = vi.fn().mockResolvedValue({ nodes: [{ id: 'team-uuid', name: 'eng' }] });
    const clientMock = makeClientMock({ createIssue: createIssueFn, teams: teamsFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'create',
      '--title',
      'T',
      '--team',
      'eng',
      '--priority',
      '0',
    ]);

    expect(createIssueFn).toHaveBeenCalledWith(expect.objectContaining({ priority: 0 }));
  });

  it('meta flags resolved and passed to mutation', async () => {
    const createIssueFn = vi.fn().mockResolvedValue(makePayloadMock());
    const teamsFn = vi.fn().mockResolvedValue({ nodes: [{ id: 'team-uuid', name: 'eng' }] });
    const issuelabelsFn = vi.fn().mockResolvedValue({ nodes: [{ id: 'label-bug', name: 'bug' }] });
    const workflowStatesFn = vi
      .fn()
      .mockResolvedValue({ nodes: [{ id: 'state-id', name: 'In Progress' }] });
    const clientMock = makeClientMock({
      createIssue: createIssueFn,
      teams: teamsFn,
      issueLabels: issuelabelsFn,
      workflowStates: workflowStatesFn,
    });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'create',
      '--title',
      'T',
      '--team',
      'eng',
      '--priority',
      '2',
      '--labels',
      'bug',
      '--state',
      'In Progress',
    ]);

    expect(createIssueFn).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 2, labelIds: ['label-bug'], stateId: 'state-id' })
    );
  });
});

// ---------------------------------------------------------------------------
// issues update
// ---------------------------------------------------------------------------
describe('issues update', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('--state by name without --team triggers ValidationError and no mutation is sent', async () => {
    const updateIssueFn = vi.fn();
    const exitErrorMock = vi.fn();
    const clientMock = makeClientMock({ updateIssue: updateIssueFn });
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok(clientMock)),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildProgram();
    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'update',
      'ISSUE-1',
      '--state',
      'In Progress',
    ]);

    expect(exitErrorMock).toHaveBeenCalledOnce();
    const err = exitErrorMock.mock.calls[0][0] as { kind: string };
    expect(err.kind).toBe('ValidationError');
    expect(updateIssueFn).not.toHaveBeenCalled();
  });

  it('only provided fields in patch', async () => {
    const updateIssueFn = vi.fn().mockResolvedValue(makePayloadMock());
    const clientMock = makeClientMock({ updateIssue: updateIssueFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'update',
      'ISSUE-1',
      '--title',
      'New',
    ]);

    expect(updateIssueFn).toHaveBeenCalledWith(
      'ISSUE-1',
      expect.objectContaining({ title: 'New' })
    );
    // Ensure only title was passed (no spurious fields)
    const [, input] = updateIssueFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(input)).toEqual(['title']);
  });

  it('labels replace semantics: labelIds replaces all', async () => {
    const updateIssueFn = vi.fn().mockResolvedValue(makePayloadMock());
    const issuelabelsFn = vi
      .fn()
      .mockResolvedValueOnce({ nodes: [{ id: 'bug-id', name: 'bug' }] })
      .mockResolvedValueOnce({ nodes: [{ id: 'feat-id', name: 'feat' }] });
    const clientMock = makeClientMock({ updateIssue: updateIssueFn, issueLabels: issuelabelsFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'update',
      'ISSUE-1',
      '--labels',
      'bug,feat',
    ]);

    expect(updateIssueFn).toHaveBeenCalledWith(
      'ISSUE-1',
      expect.objectContaining({ labelIds: ['bug-id', 'feat-id'] })
    );
  });
});

// ---------------------------------------------------------------------------
// issues batch-update
// ---------------------------------------------------------------------------
describe('issues batch-update', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('parseIds splits comma-separated args and deduplicates', async () => {
    const { parseIds } = await import('../src/features/issues/batch-update/batch-update.js');
    expect(parseIds(['ENG-1', 'ENG-2,ENG-3', 'ENG-1'])).toEqual(['ENG-1', 'ENG-2', 'ENG-3']);
  });

  it('calls updateIssue once per ID with identical resolved input', async () => {
    const updateIssueFn = vi.fn().mockResolvedValue(makePayloadMock());
    const clientMock = makeClientMock({ updateIssue: updateIssueFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node', 'linear', 'issues', 'batch-update', 'ENG-1', 'ENG-2', '--title', 'Batch Title',
    ]);

    expect(updateIssueFn).toHaveBeenCalledTimes(2);
    const [, input1] = updateIssueFn.mock.calls[0] as [string, Record<string, unknown>];
    const [, input2] = updateIssueFn.mock.calls[1] as [string, Record<string, unknown>];
    expect(input1).toEqual({ title: 'Batch Title' });
    expect(input2).toEqual({ title: 'Batch Title' });
  });

  it('sets exit code 1 when any issue update fails', async () => {
    const updateIssueFn = vi
      .fn()
      .mockResolvedValueOnce(makePayloadMock())
      .mockRejectedValueOnce(new Error('API error'));
    const clientMock = makeClientMock({ updateIssue: updateIssueFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node', 'linear', 'issues', 'batch-update', 'ENG-1', 'ENG-2', '--title', 'X',
    ]);

    expect(process.exitCode).toBe(1);
  });

  it('does not set exit code 1 when all updates succeed', async () => {
    const updateIssueFn = vi.fn().mockResolvedValue(makePayloadMock());
    const clientMock = makeClientMock({ updateIssue: updateIssueFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node', 'linear', 'issues', 'batch-update', 'ENG-1', '--title', 'X',
    ]);

    expect(process.exitCode).toBeUndefined();
  });

  it('invalid priority calls exitError before any API call', async () => {
    const updateIssueFn = vi.fn();
    const exitErrorMock = vi.fn();
    const clientMock = makeClientMock({ updateIssue: updateIssueFn });
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok(clientMock)),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildProgram();
    await program.parseAsync([
      'node', 'linear', 'issues', 'batch-update', 'ENG-1', '--priority', '5',
    ]);

    expect(exitErrorMock).toHaveBeenCalledOnce();
    const err = exitErrorMock.mock.calls[0][0] as { kind: string };
    expect(err.kind).toBe('ValidationError');
    expect(updateIssueFn).not.toHaveBeenCalled();
  });

  it('empty IDs list calls exitError with ValidationError', async () => {
    const updateIssueFn = vi.fn();
    const exitErrorMock = vi.fn();
    const clientMock = makeClientMock({ updateIssue: updateIssueFn });
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok(clientMock)),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const { batchUpdateIssues } = await import(
      '../src/features/issues/batch-update/batch-update.js'
    );
    await batchUpdateIssues({ ids: [], plain: false });

    expect(exitErrorMock).toHaveBeenCalledOnce();
    const err = exitErrorMock.mock.calls[0][0] as { kind: string };
    expect(err.kind).toBe('ValidationError');
    expect(updateIssueFn).not.toHaveBeenCalled();
  });

  it('runBatchUpdate processes all IDs and partial failures do not block other updates', async () => {
    const { runBatchUpdate } = await import(
      '../src/features/issues/batch-update/batch-update.js'
    );

    let callCount = 0;
    const updateFn = vi.fn().mockImplementation(
      async (id: string): Promise<{ ok: true; issue: { id: string; identifier: string; title: string; url: string; state: string } } | { ok: false; id: string; error: string }> => {
        callCount++;
        if (id === 'ENG-2') return { ok: false, id, error: 'failed' };
        return { ok: true, issue: { id, identifier: id, title: 'T', url: 'u', state: 's' } };
      }
    );

    const results = await runBatchUpdate(['ENG-1', 'ENG-2', 'ENG-3'], updateFn);

    expect(callCount).toBe(3);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toMatchObject({ ok: false, id: 'ENG-2', error: 'failed' });
    expect(results[2]).toMatchObject({ ok: true });
  });

  it('runBatchUpdate processes IDs in bounded chunks', async () => {
    const { runBatchUpdate, BATCH_CHUNK_SIZE } = await import(
      '../src/features/issues/batch-update/batch-update.js'
    );

    const ids = Array.from({ length: BATCH_CHUNK_SIZE + 2 }, (_, i) => `ENG-${i + 1}`);
    const updateFn = vi.fn().mockImplementation(
      async (id: string): Promise<{ ok: true; issue: { id: string; identifier: string; title: string; url: string; state: string } }> => ({
        ok: true,
        issue: { id, identifier: id, title: 'T', url: 'u', state: 's' },
      })
    );

    const results = await runBatchUpdate(ids, updateFn);

    expect(results).toHaveLength(ids.length);
    expect(updateFn).toHaveBeenCalledTimes(ids.length);
  });
});

// ---------------------------------------------------------------------------
// issues delete
// ---------------------------------------------------------------------------
describe('issues delete', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('--yes bypasses prompt and calls issueDelete', async () => {
    const deleteIssueFn = vi.fn().mockResolvedValue({ success: true });
    const clientMock = makeClientMock({ deleteIssue: deleteIssueFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'delete', 'ISSUE-1', '--yes']);

    expect(deleteIssueFn).toHaveBeenCalledWith('ISSUE-1');
  });

  it('errors in non-TTY without --yes and does not call issueDelete', async () => {
    const deleteIssueFn = vi.fn();
    const exitErrorMock = vi.fn();
    const clientMock = makeClientMock({ deleteIssue: deleteIssueFn });

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok(clientMock)),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'delete', 'ISSUE-1']);

    expect(exitErrorMock).toHaveBeenCalled();
    expect(deleteIssueFn).not.toHaveBeenCalled();
  });
});
