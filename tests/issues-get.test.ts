import { err, ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssueResponse(overrides: Record<string, unknown> = {}) {
  return {
    issue: {
      id: 'issue-uuid',
      identifier: 'ENG-42',
      title: 'Test issue',
      description: 'A description',
      url: 'https://linear.app/test/ENG-42',
      branchName: 'eng-42-test-issue',
      priority: 2,
      estimate: 3,
      dueDate: '2026-12-31',
      createdAt: '2026-01-01T00:00:00.000Z',
      state: { id: 'state-uuid', name: 'In Progress', type: 'started' },
      assignee: {
        id: 'user-uuid',
        name: 'Alice',
        displayName: 'Alice A.',
        email: 'alice@example.com',
      },
      labels: { nodes: [{ id: 'label-uuid', name: 'bug', color: '#ff0000' }] },
      project: { id: 'proj-uuid', name: 'My Project' },
      parent: { id: 'parent-uuid', identifier: 'ENG-10', title: 'Parent Issue' },
      children: { nodes: [{ id: 'child-uuid', identifier: 'ENG-43', title: 'Child Issue' }] },
      attachments: { nodes: [{ title: 'PR', url: 'https://github.com/pr/1' }] },
      ...overrides,
    },
  };
}

function stdMocks(requestFn: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({})),
    getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
    getRequestFn: vi.fn().mockReturnValue(requestFn),
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
  program.option('--plain', 'Output as plain key:value text (agent-friendly)').exitOverride();
  registerIssues(program);
  return program;
}

// ---------------------------------------------------------------------------
// issues get
// ---------------------------------------------------------------------------
describe('issues get', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('fetches issue detail fields', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeIssueResponse());
    let capturedRows: string[][] = [];

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows = rows;
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42']);

    expect(requestFn).toHaveBeenCalledOnce();
    const flat = capturedRows.flat();
    expect(flat).toContain('ENG-42');
    expect(flat).toContain('Test issue');
    expect(flat).toContain('In Progress');
    expect(flat).toContain('Alice A.');
  });

  it('fetches when no attachments', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeIssueResponse({ attachments: { nodes: [] } }));
    let capturedRows: string[][] = [];

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows = rows;
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42']);

    expect(requestFn).toHaveBeenCalledOnce();
    const flat = capturedRows.flat();
    expect(flat).toContain('ENG-42');
    expect(flat).toContain('Test issue');
  });

  it('unknown ID calls exitError', async () => {
    const requestFn = vi.fn().mockResolvedValue({ issue: null });
    const exitErrorMock = vi.fn();

    stdMocks(requestFn);
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'bad-id']);

    expect(exitErrorMock).toHaveBeenCalled();
  });

  it('non-TTY uses prettyTable output', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeIssueResponse());
    const printTableCalls: unknown[] = [];

    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue('TABLE'),
      printTable: vi.fn().mockImplementation((s: unknown) => printTableCalls.push(s)),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42']);

    expect(printTableCalls.length).toBeGreaterThan(0);
  });

  it('--plain outputs required fields and omits dropped fields', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue(makeIssueResponse({ description: 'Line one\nLine two' }));
    stdMocks(requestFn);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42', '--plain']);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');

    // Required fields present
    expect(output).toContain('Issue: ENG-42');
    expect(output).toContain('title: Test issue');
    expect(output).toContain('state: In Progress');
    expect(output).toContain('assignee: Alice');
    expect(output).toContain('url: https://linear.app/test/ENG-42');
    expect(output).toContain('branchName: eng-42-test-issue');
    expect(output).toContain('dueDate: 2026-12-31');
    expect(output).toContain('parent: ENG-10');
    expect(output).toContain('children: ENG-43');
    expect(output).toContain('description: |<<');

    // Dropped fields absent
    expect(output).not.toContain('createdAt');
    expect(output).not.toContain('estimate');
    expect(output).not.toContain('attachments');

    consoleSpy.mockRestore();
  });

  it('unauthenticated calls exitError', async () => {
    const exitErrorMock = vi.fn();
    const authErr = {
      kind: 'UnauthenticatedError' as const,
      message: 'Not authenticated',
      name: 'UnauthenticatedError',
    };

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(err(authErr)),
      getClientWithAuthRetry: vi.fn().mockReturnValue(err(authErr)),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42']);

    expect(exitErrorMock).toHaveBeenCalled();
  });

  // --- H-161: `issues get <id>` fetches trashed/archived issues directly by ID,
  // but hides trashed/archived children by default; --include-deleted opts in. ---

  it('fetches a trashed issue directly by ID', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeIssueResponse({ trashed: true }));
    stdMocks(requestFn);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42', '--plain']);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('Issue: ENG-42');

    consoleSpy.mockRestore();
  });

  it('hides trashed/archived children by default', async () => {
    const requestFn = vi.fn().mockResolvedValue(
      makeIssueResponse({
        children: {
          nodes: [
            {
              id: 'c-active',
              identifier: 'ENG-43',
              title: 'Active child',
              trashed: false,
              archivedAt: null,
            },
            {
              id: 'c-trashed',
              identifier: 'ENG-44',
              title: 'Trashed child',
              trashed: true,
              archivedAt: null,
            },
            {
              id: 'c-archived',
              identifier: 'ENG-45',
              title: 'Archived child',
              trashed: false,
              archivedAt: '2024-01-01T00:00:00.000Z',
            },
          ],
        },
      })
    );
    stdMocks(requestFn);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42', '--plain']);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('ENG-43');
    expect(output).not.toContain('ENG-44');
    expect(output).not.toContain('ENG-45');

    consoleSpy.mockRestore();
  });

  it('renders labels and blocked-by/blocking relations in table output', async () => {
    const requestFn = vi.fn().mockResolvedValue(
      makeIssueResponse({
        labels: { nodes: [{ id: 'l1', name: 'bug', color: '#ff0000' }] },
        relations: {
          nodes: [{ id: 'rel-1', type: 'blocks', relatedIssue: { identifier: 'ENG-50' } }],
        },
        inverseRelations: {
          nodes: [{ id: 'rel-2', type: 'blocks', issue: { identifier: 'ENG-51' } }],
        },
      })
    );
    let capturedRows: string[][] = [];

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows = rows;
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42']);

    const flat = capturedRows.flat();
    expect(flat).toContain('bug');
    expect(flat.some((c) => c.includes('ENG-51'))).toBe(true); // Blocked By
    expect(flat.some((c) => c.includes('ENG-50'))).toBe(true); // Blocking
  });

  it('renders labels and blocked-by/blocking relations in --plain output', async () => {
    const requestFn = vi.fn().mockResolvedValue(
      makeIssueResponse({
        labels: {
          nodes: [
            { id: 'l1', name: 'bug' },
            { id: 'l2', name: 'urgent' },
          ],
        },
        relations: {
          nodes: [{ id: 'rel-1', type: 'blocks', relatedIssue: { identifier: 'ENG-50' } }],
        },
        inverseRelations: {
          nodes: [{ id: 'rel-2', type: 'blocks', issue: { identifier: 'ENG-51' } }],
        },
      })
    );
    stdMocks(requestFn);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42', '--plain']);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('labels: bug, urgent');
    expect(output).toContain('blockedBy: ENG-51');
    expect(output).toContain('blocking: ENG-50');

    consoleSpy.mockRestore();
  });

  it('--include-deleted shows trashed/archived children', async () => {
    const requestFn = vi.fn().mockResolvedValue(
      makeIssueResponse({
        children: {
          nodes: [
            {
              id: 'c-active',
              identifier: 'ENG-43',
              title: 'Active child',
              trashed: false,
              archivedAt: null,
            },
            {
              id: 'c-trashed',
              identifier: 'ENG-44',
              title: 'Trashed child',
              trashed: true,
              archivedAt: null,
            },
            {
              id: 'c-archived',
              identifier: 'ENG-45',
              title: 'Archived child',
              trashed: false,
              archivedAt: '2024-01-01T00:00:00.000Z',
            },
          ],
        },
      })
    );
    stdMocks(requestFn);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = await buildProgram();
    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'get',
      'ENG-42',
      '--plain',
      '--include-deleted',
    ]);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('ENG-43');
    expect(output).toContain('ENG-44');
    expect(output).toContain('ENG-45');

    consoleSpy.mockRestore();
  });
});
