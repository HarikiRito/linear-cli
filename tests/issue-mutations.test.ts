import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeIssueRaw() {
  return {
    id: 'uuid-1',
    identifier: 'ISSUE-1',
    title: 'Test Issue',
    url: 'https://linear.app/issue/ISSUE-1',
    state: { name: 'Todo' },
  };
}

function stdMocks(request: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({ client: { request } })),
    getRequestFn: (c: { client: { request: typeof request } }) => c.client.request,
  }));
  vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
  vi.doMock('../src/lib/output/markdown.js', () => ({
    markdownTable: vi.fn().mockReturnValue(''),
    printMarkdown: vi.fn(),
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
    const request = vi
      .fn()
      // First call: resolveTeam name lookup
      .mockResolvedValueOnce({ teams: { nodes: [{ id: 'team-uuid', name: 'Engineering' }] } })
      // Second call: issueCreate mutation
      .mockResolvedValueOnce({ issueCreate: { success: true, issue: makeIssueRaw() } });
    stdMocks(request);
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
      '--json',
    ]);

    const createCall = request.mock.calls.find(([q]: unknown[]) => (q as string).includes('issueCreate'));
    expect(createCall).toBeDefined();
    const [, vars] = createCall as [string, { input: Record<string, unknown> }];
    expect(vars.input).toMatchObject({ teamId: 'team-uuid', title: 'Foo' });
  });

  it('missing --title causes Commander error before any network call', async () => {
    const request = vi.fn();
    stdMocks(request);
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'issues', 'create', '--team', 'eng'])
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('missing --team causes Commander error before any network call', async () => {
    const request = vi.fn();
    stdMocks(request);
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'issues', 'create', '--title', 'Foo'])
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('priority 5 is rejected before any network call', async () => {
    const request = vi.fn();
    const exitErrorMock = vi.fn();
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ client: { request } })),
    getRequestFn: (c: { client: { request: typeof request } }) => c.client.request,
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
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
    expect(request).not.toHaveBeenCalled();
  });

  it('priority 0 is accepted and passed to mutation', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ teams: { nodes: [{ id: 'team-uuid', name: 'eng' }] } })
      .mockResolvedValueOnce({ issueCreate: { success: true, issue: makeIssueRaw() } });
    stdMocks(request);
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
      '--json',
    ]);

    const createCall = request.mock.calls.find(([q]: unknown[]) => (q as string).includes('issueCreate'));
    expect(createCall).toBeDefined();
    const [, vars] = createCall as [string, { input: Record<string, unknown> }];
    expect(vars.input).toMatchObject({ priority: 0 });
  });

  it('meta flags resolved and passed to mutation', async () => {
    const request = vi
      .fn()
      // resolveTeam
      .mockResolvedValueOnce({ teams: { nodes: [{ id: 'team-uuid', name: 'eng' }] } })
      // resolveLabel 'bug'
      .mockResolvedValueOnce({ issueLabels: { nodes: [{ id: 'label-bug', name: 'bug' }] } })
      // resolveWorkflowState 'In Progress'
      .mockResolvedValueOnce({
        team: { states: { nodes: [{ id: 'state-id', name: 'In Progress' }] } },
      })
      // issueCreate
      .mockResolvedValueOnce({ issueCreate: { success: true, issue: makeIssueRaw() } });
    stdMocks(request);
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
      '--json',
    ]);

    const createCall = request.mock.calls.find(([q]: unknown[]) => (q as string).includes('issueCreate'));
    expect(createCall).toBeDefined();
    const [, vars] = createCall as [string, { input: Record<string, unknown> }];
    expect(vars.input).toMatchObject({ priority: 2, labelIds: ['label-bug'], stateId: 'state-id' });
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
    const request = vi.fn();
    const exitErrorMock = vi.fn();
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ client: { request } })),
    getRequestFn: (c: { client: { request: typeof request } }) => c.client.request,
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildProgram();
    await program.parseAsync([
      'node', 'linear', 'issues', 'update', 'ISSUE-1', '--state', 'In Progress',
    ]);

    expect(exitErrorMock).toHaveBeenCalledOnce();
    const err = exitErrorMock.mock.calls[0][0] as { kind: string };
    expect(err.kind).toBe('ValidationError');
    expect(request).not.toHaveBeenCalled();
  });

  it('only provided fields in patch', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ issueUpdate: { success: true, issue: makeIssueRaw() } });
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'update',
      'ISSUE-1',
      '--title',
      'New',
      '--json',
    ]);

    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('issueUpdate'),
      expect.objectContaining({ id: 'ISSUE-1', input: { title: 'New' } })
    );
  });

  it('labels replace semantics: labelIds replaces all', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ issueLabels: { nodes: [{ id: 'bug-id', name: 'bug' }] } })
      .mockResolvedValueOnce({ issueLabels: { nodes: [{ id: 'feat-id', name: 'feat' }] } })
      .mockResolvedValueOnce({ issueUpdate: { success: true, issue: makeIssueRaw() } });
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'update',
      'ISSUE-1',
      '--labels',
      'bug,feat',
      '--json',
    ]);

    const updateCall = request.mock.calls.find(([q]: unknown[]) => (q as string).includes('issueUpdate'));
    expect(updateCall).toBeDefined();
    const [, vars] = updateCall as [string, { input: Record<string, unknown> }];
    expect(vars.input).toMatchObject({ labelIds: ['bug-id', 'feat-id'] });
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
    const request = vi.fn().mockResolvedValue({ issueDelete: { success: true } });
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'delete', 'ISSUE-1', '--yes']);

    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('issueDelete'),
      expect.objectContaining({ id: 'ISSUE-1' })
    );
  });

  it('errors in non-TTY without --yes and does not call issueDelete', async () => {
    const request = vi.fn();
    const exitErrorMock = vi.fn();
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ client: { request } })),
    getRequestFn: (c: { client: { request: typeof request } }) => c.client.request,
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
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
    expect(request).not.toHaveBeenCalled();
  });
});
