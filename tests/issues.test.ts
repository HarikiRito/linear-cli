import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeIssueNode(id: string, title: string) {
  return {
    identifier: id,
    title,
    state: { name: 'Todo' },
    assignee: { displayName: 'Alice' },
  };
}

// client.client.request() returns unwrapped data: { <rootKey>: { nodes, pageInfo } }
function makeListResponse(
  nodes: ReturnType<typeof makeIssueNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { issues: { nodes, pageInfo } };
}

function makeSearchResponse(
  nodes: ReturnType<typeof makeIssueNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { searchIssues: { nodes, pageInfo } };
}

function stdMocks(request: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    // Issues list/me/query use requestFn + TypedDocumentNode — provide a stub client
    // and return the request spy from getRequestFn.
    getClient: vi.fn().mockReturnValue(ok({})),
    getRequestFn: vi.fn().mockReturnValue(request),
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
// issues list
// ---------------------------------------------------------------------------
describe('issues list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('makes exactly ONE request call (no N+1)', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Issue 1')]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list', '--json']);

    expect(request).toHaveBeenCalledOnce();
  });

  it('reads state and assignee inline from response (no extra requests)', async () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      makeIssueNode(`ENG-${i + 1}`, `Issue ${i + 1}`)
    );
    const request = vi.fn().mockResolvedValue(makeListResponse(nodes));
    stdMocks(request);

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--json']);

    expect(request).toHaveBeenCalledOnce();
    const out = printJsonCalls[0] as { issues: { state: string; assignee: string }[] };
    expect(out.issues[0].state).toBe('Todo');
    expect(out.issues[0].assignee).toBe('Alice');
  });

  it('respects --limit (passes as "first" variable)', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list', '--json', '--limit', '10']);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ first: 10 })
    );
  });

  it('--after passes cursor in variables', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'list',
      '--json',
      '--after',
      'cursor123',
    ]);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ after: 'cursor123' })
    );
  });

  it('--all fetches multiple pages (one request per page)', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        makeListResponse(
          Array.from({ length: 50 }, (_, i) => makeIssueNode(`ENG-${i + 1}`, `Issue ${i + 1}`)),
          { hasNextPage: true, endCursor: 'cur1' }
        )
      )
      .mockResolvedValueOnce(
        makeListResponse(
          Array.from({ length: 10 }, (_, i) => makeIssueNode(`ENG-${i + 51}`, `Issue ${i + 51}`)),
          { hasNextPage: false, endCursor: null }
        )
      );
    stdMocks(request);

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--all', '--json']);

    expect(request).toHaveBeenCalledTimes(2);
    const result = printJsonCalls[0] as { issues: unknown[] };
    expect(result.issues.length).toBe(60);
  });

  it('--json output includes pageInfo with hasNextPage and endCursor', async () => {
    const request = vi.fn().mockResolvedValue(
      makeListResponse([makeIssueNode('ENG-1', 'Issue 1')], {
        hasNextPage: true,
        endCursor: 'abc123',
      })
    );
    stdMocks(request);

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--json']);

    const out = printJsonCalls[0] as { pageInfo: { hasNextPage: boolean; endCursor: string } };
    expect(out.pageInfo.hasNextPage).toBe(true);
    expect(out.pageInfo.endCursor).toBe('abc123');
  });

  it('filters by --team server-side', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list', '--json', '--team', 'ENG']);

    // With default state filter, team filter is AND-merged with state filter
    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    expect(JSON.stringify(vars)).toContain('"ENG"');
  });

  it('default state filter uses todo/in_progress/dev_review as OR-of-eqIgnoreCase', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list', '--json']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).toContain('eqIgnoreCase');
    expect(json).toContain('"todo"');
    expect(json).toContain('"in progress"');
    expect(json).toContain('"dev review"');
  });

  it('--state in_progress,dev_review sends those two tokens only', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'list',
      '--json',
      '--state',
      'in_progress,dev_review',
    ]);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).toContain('"in progress"');
    expect(json).toContain('"dev review"');
    expect(json).not.toContain('"todo"');
  });

  it('--all-states sends NO state filter', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list', '--json', '--all-states']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    expect(JSON.stringify(vars)).not.toContain('eqIgnoreCase');
  });

  it('--team AND state filter merged via AND', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list', '--json', '--team', 'ENG']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).toContain('"ENG"');
    expect(json).toContain('eqIgnoreCase');
    expect(json).toContain('"and"');
  });
});

// ---------------------------------------------------------------------------
// issues me
// ---------------------------------------------------------------------------
describe('issues me', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('makes exactly ONE request call (no N+1)', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Issue 1')]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'me', '--json']);

    expect(request).toHaveBeenCalledOnce();
  });

  it('passes isMe filter as a variable (no separate viewer call)', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'me', '--json']);

    // Exactly one request — no second viewer call
    expect(request).toHaveBeenCalledOnce();
    // isMe is passed via the filter variable (merged with state filter)
    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    expect(JSON.stringify(vars)).toContain('isMe');
  });

  it('respects --limit', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'me', '--json', '--limit', '7']);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ first: 7 })
    );
  });

  it('--after passes cursor in variables', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'me', '--json', '--after', 'meCursor']);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ after: 'meCursor' })
    );
  });

  it('--json output includes pageInfo', async () => {
    const request = vi.fn().mockResolvedValue(
      makeListResponse([makeIssueNode('ENG-1', 'Issue 1')], {
        hasNextPage: true,
        endCursor: 'meNext',
      })
    );
    stdMocks(request);

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'me', '--json']);

    const out = printJsonCalls[0] as { pageInfo: { hasNextPage: boolean; endCursor: string } };
    expect(out.pageInfo.hasNextPage).toBe(true);
    expect(out.pageInfo.endCursor).toBe('meNext');
  });

  it('default state filter applied to me (OR-of-eqIgnoreCase)', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'me', '--json']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).toContain('eqIgnoreCase');
    expect(json).toContain('isMe');
  });

  it('--all-states on me sends NO state filter but keeps isMe', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'me', '--json', '--all-states']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).not.toContain('eqIgnoreCase');
    expect(json).toContain('isMe');
  });
});

// ---------------------------------------------------------------------------
// issues query
// ---------------------------------------------------------------------------
describe('issues query', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('makes exactly ONE request call per page (no N+1)', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(makeSearchResponse([makeIssueNode('ENG-1', 'Issue 1')]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', '--json']);

    expect(request).toHaveBeenCalledOnce();
  });

  it('passes the search term as a variable', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'query', 'my search term', '--json']);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ term: 'my search term' })
    );
  });

  it('uses searchIssues GraphQL query (not issues filter)', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', '--json']);

    // requestFn is now called with (TypedDocumentNode, vars) — check the document name
    const [docArg] = request.mock.calls[0] as [
      { kind: string; definitions: Array<{ name?: { value: string } }> },
      Record<string, unknown>,
    ];
    expect(docArg.kind).toBe('Document');
    const opName = docArg.definitions[0]?.name?.value ?? '';
    expect(opName).toBe('SearchIssues');
  });

  it('respects --limit', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'query',
      'bug',
      '--json',
      '--limit',
      '20',
    ]);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ first: 20 })
    );
  });

  it('--after passes cursor in variables', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'query',
      'bug',
      '--json',
      '--after',
      'qCursor',
    ]);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ after: 'qCursor' })
    );
  });

  it('--all fetches multiple pages', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        makeSearchResponse(
          Array.from({ length: 50 }, (_, i) => makeIssueNode(`ENG-${i + 1}`, `Issue ${i + 1}`)),
          { hasNextPage: true, endCursor: 'qCur1' }
        )
      )
      .mockResolvedValueOnce(
        makeSearchResponse(
          Array.from({ length: 5 }, (_, i) => makeIssueNode(`ENG-${i + 51}`, `Issue ${i + 51}`)),
          { hasNextPage: false, endCursor: null }
        )
      );
    stdMocks(request);

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', '--all', '--json']);

    expect(request).toHaveBeenCalledTimes(2);
    const result = printJsonCalls[0] as { issues: unknown[] };
    expect(result.issues.length).toBe(55);
  });

  it('--json output includes pageInfo', async () => {
    const request = vi.fn().mockResolvedValue(
      makeSearchResponse([makeIssueNode('ENG-1', 'Bug')], {
        hasNextPage: true,
        endCursor: 'qNext',
      })
    );
    stdMocks(request);

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', '--json']);

    const out = printJsonCalls[0] as { pageInfo: { hasNextPage: boolean; endCursor: string } };
    expect(out.pageInfo.hasNextPage).toBe(true);
    expect(out.pageInfo.endCursor).toBe('qNext');
  });

  it('default state filter applied to query search (OR-of-eqIgnoreCase)', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', '--json']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).toContain('eqIgnoreCase');
    expect(json).toContain('"bug"');
  });

  it('--all-states on query removes state filter but keeps term', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'query',
      'bug',
      '--json',
      '--all-states',
    ]);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).not.toContain('eqIgnoreCase');
    expect(json).toContain('"bug"');
  });
});

// ---------------------------------------------------------------------------
// TTY output selection
// ---------------------------------------------------------------------------
describe('TTY output selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('issues list: --json always outputs JSON regardless of isTTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue('TABLE'),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--json', '--all-states']);

    expect(printJsonCalls.length).toBeGreaterThan(0);
  });

  it('issues list: isTTY=true uses prettyTable (cli-table3)', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    const printTableCalls: unknown[] = [];
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue('PRETTY'),
      printTable: vi.fn().mockImplementation((s: unknown) => printTableCalls.push(s)),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--all-states']);

    expect(printTableCalls.length).toBeGreaterThan(0);
    expect(printTableCalls[0]).toBe('PRETTY');
  });

  it('issues list: isTTY=false uses markdown', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
    const printMarkdownCalls: unknown[] = [];
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
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--all-states']);

    expect(printMarkdownCalls.length).toBeGreaterThan(0);
    expect(printMarkdownCalls[0]).toBe('MD');
  });

  it('issues list: isTTY=false emits console.error with count label (non-TTY countLabel path)', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
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

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--all-states']);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/Showing \d+ issues/));

    consoleErrorSpy.mockRestore();
  });

  it('teams list: isTTY=true uses prettyTable', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
    // teams/list now uses client.teams() SDK method directly (not requestFn)
    const teamsFn = vi.fn().mockResolvedValue({
      nodes: [{ id: 't1', name: 'Eng', key: 'ENG' }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ teams: teamsFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    const printTableCalls: unknown[] = [];
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue('TEAMS_TABLE'),
      printTable: vi.fn().mockImplementation((s: unknown) => printTableCalls.push(s)),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const { registerTeams } = await import('../src/features/teams/command.js');
    const { Command } = await import('commander');
    const prog = new Command();
    prog.exitOverride();
    registerTeams(prog);

    await prog.parseAsync(['node', 'linear', 'teams', 'list']);

    expect(printTableCalls.length).toBeGreaterThan(0);
    expect(printTableCalls[0]).toBe('TEAMS_TABLE');
  });
});

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------
describe('exit codes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.doUnmock('../src/lib/runner.js');
    vi.resetModules();
    process.exitCode = undefined;
  });

  beforeEach(() => {
    vi.doUnmock('../src/lib/runner.js');
  });

  it('sets process.exitCode = 1 on RATELIMITED error (issues list)', async () => {
    const rateLimitErr = {
      kind: 'RateLimitError' as const,
      message: 'Linear rate limit reached. Please wait before retrying.',
      name: 'RateLimitError',
    };

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(err(rateLimitErr)),
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

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--json']);

    expect(process.exitCode).toBe(1);
  });

  it('does not set process.exitCode on success (issues list)', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
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

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--json']);

    expect(process.exitCode).toBeUndefined();
  });

  it('bare `issues` (no subcommand) exits 0 — help is not an error', async () => {
    // Simulate the src/index.ts catch handler: commander.help / commander.helpDisplayed
    // must NOT set process.exitCode = 1.
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();

    // Capture any thrown CommanderError and apply the same logic as src/index.ts
    const applyIndexCatch = (err: unknown) => {
      if (err instanceof Error && 'code' in err) {
        const code = (err as { code: string }).code;
        if (
          code === 'commander.helpDisplayed' ||
          code === 'commander.help' ||
          code === 'commander.version'
        ) {
          return; // exit 0 — informational, not an error
        }
      }
      process.exitCode = 1;
    };

    try {
      await program.parseAsync(['node', 'linear', 'issues']);
    } catch (e) {
      applyIndexCatch(e);
    }

    // Help was shown — exit code must remain 0 (undefined = not set)
    expect(process.exitCode).toBeUndefined();
  });

  it('unknown top-level command exits non-zero', async () => {
    // Build a minimal program that mirrors the src/index.ts exitOverride + catch logic.
    // An unrecognized top-level command throws commander.unknownCommand — that IS an error.
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const { Command } = await import('commander');
    const program = new Command();
    program.exitOverride();
    // Register a stub command so the program has subcommands like the real CLI
    const { registerIssues } = await import('../src/features/issues/command.js');
    registerIssues(program);

    const applyIndexCatch = (err: unknown) => {
      if (err instanceof Error && 'code' in err) {
        const code = (err as { code: string }).code;
        if (
          code === 'commander.helpDisplayed' ||
          code === 'commander.help' ||
          code === 'commander.version'
        ) {
          return;
        }
      }
      process.exitCode = 1;
    };

    try {
      await program.parseAsync(['node', 'linear', 'totally-unknown-command']);
    } catch (e) {
      applyIndexCatch(e);
    }

    expect(process.exitCode).toBe(1);
  });
});
