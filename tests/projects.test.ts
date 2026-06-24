import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeProjectNode(id: string, name: string, state: string) {
  return { id, name, state };
}

// client.client.request() returns unwrapped data: { projects: { nodes, pageInfo } }
function makeListResponse(
  nodes: ReturnType<typeof makeProjectNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { projects: { nodes, pageInfo } };
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
  vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
}

async function buildProgram() {
  const { registerProjects } = await import('../src/features/projects/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerProjects(program);
  return program;
}

// ---------------------------------------------------------------------------
// projects list
// ---------------------------------------------------------------------------
describe('projects list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('makes exactly ONE request call per page (no N+1)', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([makeProjectNode('p1', 'Alpha', 'started')]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'projects', 'list', '--json']);

    expect(request).toHaveBeenCalledOnce();
  });

  it('reads id, name, state inline from response', async () => {
    const nodes = [makeProjectNode('p1', 'Alpha', 'started'), makeProjectNode('p2', 'Beta', 'planned')];
    const request = vi.fn().mockResolvedValue(makeListResponse(nodes));
    stdMocks(request);

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'projects', 'list', '--json']);

    expect(request).toHaveBeenCalledOnce();
    const out = printJsonCalls[0] as { projects: { id: string; name: string; state: string }[] };
    expect(out.projects[0]).toEqual({ id: 'p1', name: 'Alpha', state: 'started' });
    expect(out.projects[1]).toEqual({ id: 'p2', name: 'Beta', state: 'planned' });
  });

  it('respects --limit (passes as "first" variable)', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'projects', 'list', '--json', '--limit', '15']);

    expect(request).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ first: 15 }));
  });

  it('--after passes cursor in variables', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'projects', 'list', '--json', '--after', 'projCursor']);

    expect(request).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ after: 'projCursor' })
    );
  });

  it('--all fetches multiple pages (one request per page)', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        makeListResponse(
          Array.from({ length: 50 }, (_, i) => makeProjectNode(`p${i + 1}`, `Project ${i + 1}`, 'started')),
          { hasNextPage: true, endCursor: 'pCur1' }
        )
      )
      .mockResolvedValueOnce(
        makeListResponse(
          Array.from({ length: 4 }, (_, i) => makeProjectNode(`p${i + 51}`, `Project ${i + 51}`, 'planned')),
          { hasNextPage: false, endCursor: null }
        )
      );
    stdMocks(request);

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'projects', 'list', '--all', '--json']);

    expect(request).toHaveBeenCalledTimes(2);
    const result = printJsonCalls[0] as { projects: unknown[] };
    expect(result.projects.length).toBe(54);
  });

  it('--json output includes pageInfo with hasNextPage and endCursor', async () => {
    const request = vi.fn().mockResolvedValue(
      makeListResponse([makeProjectNode('p1', 'Alpha', 'started')], { hasNextPage: true, endCursor: 'pNext' })
    );
    stdMocks(request);

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'projects', 'list', '--json']);

    const out = printJsonCalls[0] as { pageInfo: { hasNextPage: boolean; endCursor: string } };
    expect(out.pageInfo.hasNextPage).toBe(true);
    expect(out.pageInfo.endCursor).toBe('pNext');
  });

  it('renders Markdown by default', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([makeProjectNode('p1', 'Alpha', 'started')]));
    stdMocks(request);

    const printMarkdownCalls: unknown[] = [];
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue('TABLE'),
      printMarkdown: vi.fn().mockImplementation((s: unknown) => printMarkdownCalls.push(s)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'projects', 'list']);

    expect(printMarkdownCalls.length).toBeGreaterThan(0);
    expect(printMarkdownCalls[0]).toBe('TABLE');
  });
});

// ---------------------------------------------------------------------------
// projects help / exit codes
// ---------------------------------------------------------------------------
describe('projects exit codes', () => {
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

  it('bare `projects` (no subcommand) exits 0 — help is not an error', async () => {
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();

    const applyIndexCatch = (e: unknown) => {
      if (e instanceof Error && 'code' in e) {
        const code = (e as { code: string }).code;
        if (code === 'commander.helpDisplayed' || code === 'commander.help' || code === 'commander.version') {
          return;
        }
      }
      process.exitCode = 1;
    };

    try {
      await program.parseAsync(['node', 'linear', 'projects']);
    } catch (e) {
      applyIndexCatch(e);
    }

    expect(process.exitCode).toBeUndefined();
  });

  it('sets process.exitCode = 1 on error', async () => {
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

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'projects', 'list', '--json']);

    expect(process.exitCode).toBe(1);
  });
});
