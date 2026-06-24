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
    getRequestFn: vi.fn().mockReturnValue(requestFn),
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
// issues get
// ---------------------------------------------------------------------------
describe('issues get', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('JSON includes all detail fields', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeIssueResponse());
    const printJsonCalls: unknown[] = [];

    stdMocks(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42', '--json']);

    expect(requestFn).toHaveBeenCalledOnce();
    const out = printJsonCalls[0] as { issue: Record<string, unknown> };
    expect(out.issue).toBeDefined();
    expect(out.issue.id).toBe('issue-uuid');
    expect(out.issue.identifier).toBe('ENG-42');
    expect(out.issue.title).toBe('Test issue');
    expect(out.issue.description).toBe('A description');
    expect(out.issue.url).toContain('linear.app');
    expect(out.issue.branchName).toBe('eng-42-test-issue');
    expect(out.issue.priority).toBe(2);
    expect(out.issue.estimate).toBe(3);
    expect(out.issue.dueDate).toBe('2026-12-31');
    expect(out.issue.createdAt).toBeTruthy();
    expect(out.issue.state).toMatchObject({ name: 'In Progress' });
    expect(out.issue.assignee).toMatchObject({ name: 'Alice' });
    expect(Array.isArray(out.issue.labels)).toBe(true);
    expect(out.issue.project).toMatchObject({ id: 'proj-uuid' });
    expect(out.issue.parent).toMatchObject({ identifier: 'ENG-10' });
    expect(Array.isArray(out.issue.children)).toBe(true);
    expect(Array.isArray(out.issue.attachments)).toBe(true);
  });

  it('attachments array is empty when no attachments', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeIssueResponse({ attachments: { nodes: [] } }));
    const printJsonCalls: unknown[] = [];

    stdMocks(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42', '--json']);

    const out = printJsonCalls[0] as { issue: { attachments: unknown[] } };
    expect(out.issue.attachments).toEqual([]);
  });

  it('unknown ID calls exitError', async () => {
    const requestFn = vi.fn().mockResolvedValue({ issue: null });
    const exitErrorMock = vi.fn();

    stdMocks(requestFn);
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'bad-id', '--json']);

    expect(exitErrorMock).toHaveBeenCalled();
  });

  it('non-TTY without --json uses markdown output', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeIssueResponse());
    const printMarkdownCalls: unknown[] = [];

    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue('MD'),
      printMarkdown: vi.fn().mockImplementation((s: unknown) => printMarkdownCalls.push(s)),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42']);

    expect(printMarkdownCalls.length).toBeGreaterThan(0);
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
      getRequestFn: vi.fn(),
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
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-42', '--json']);

    expect(exitErrorMock).toHaveBeenCalled();
  });
});
