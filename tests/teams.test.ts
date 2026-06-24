import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTeamNode(id: string, name: string, key: string) {
  return { id, name, key };
}

// client.client.request() returns unwrapped data: { teams: { nodes, pageInfo } }
function makeListResponse(
  nodes: ReturnType<typeof makeTeamNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { teams: { nodes, pageInfo } };
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
  const { registerTeams } = await import('../src/features/teams/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerTeams(program);
  return program;
}

// ---------------------------------------------------------------------------
// teams list
// ---------------------------------------------------------------------------
describe('teams list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('makes exactly ONE request call per page (no N+1)', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([makeTeamNode('t1', 'Engineering', 'ENG')]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'teams', 'list', '--json']);

    expect(request).toHaveBeenCalledOnce();
  });

  it('reads id, name, key inline from response', async () => {
    const nodes = [makeTeamNode('t1', 'Engineering', 'ENG'), makeTeamNode('t2', 'Design', 'DES')];
    const request = vi.fn().mockResolvedValue(makeListResponse(nodes));
    stdMocks(request);

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'teams', 'list', '--json']);

    expect(request).toHaveBeenCalledOnce();
    const out = printJsonCalls[0] as { teams: { id: string; name: string; key: string }[] };
    expect(out.teams[0]).toEqual({ id: 't1', name: 'Engineering', key: 'ENG' });
    expect(out.teams[1]).toEqual({ id: 't2', name: 'Design', key: 'DES' });
  });

  it('respects --limit (passes as "first" variable)', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'teams', 'list', '--json', '--limit', '5']);

    expect(request).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ first: 5 }));
  });

  it('--after passes cursor in variables', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'teams', 'list', '--json', '--after', 'teamCursor']);

    expect(request).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ after: 'teamCursor' })
    );
  });

  it('--all fetches multiple pages (one request per page)', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        makeListResponse(
          Array.from({ length: 50 }, (_, i) => makeTeamNode(`t${i + 1}`, `Team ${i + 1}`, `T${i + 1}`)),
          { hasNextPage: true, endCursor: 'tCur1' }
        )
      )
      .mockResolvedValueOnce(
        makeListResponse(
          Array.from({ length: 3 }, (_, i) => makeTeamNode(`t${i + 51}`, `Team ${i + 51}`, `T${i + 51}`)),
          { hasNextPage: false, endCursor: null }
        )
      );
    stdMocks(request);

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'teams', 'list', '--all', '--json']);

    expect(request).toHaveBeenCalledTimes(2);
    const result = printJsonCalls[0] as { teams: unknown[] };
    expect(result.teams.length).toBe(53);
  });

  it('--json output includes pageInfo with hasNextPage and endCursor', async () => {
    const request = vi.fn().mockResolvedValue(
      makeListResponse([makeTeamNode('t1', 'Engineering', 'ENG')], { hasNextPage: true, endCursor: 'tNext' })
    );
    stdMocks(request);

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'teams', 'list', '--json']);

    const out = printJsonCalls[0] as { pageInfo: { hasNextPage: boolean; endCursor: string } };
    expect(out.pageInfo.hasNextPage).toBe(true);
    expect(out.pageInfo.endCursor).toBe('tNext');
  });

  it('renders Markdown by default', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([makeTeamNode('t1', 'Engineering', 'ENG')]));
    stdMocks(request);

    const printMarkdownCalls: unknown[] = [];
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue('TABLE'),
      printMarkdown: vi.fn().mockImplementation((s: unknown) => printMarkdownCalls.push(s)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'teams', 'list']);

    expect(printMarkdownCalls.length).toBeGreaterThan(0);
    expect(printMarkdownCalls[0]).toBe('TABLE');
  });
});

// ---------------------------------------------------------------------------
// teams help / exit codes
// ---------------------------------------------------------------------------
describe('teams exit codes', () => {
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

  it('bare `teams` (no subcommand) exits 0 — help is not an error', async () => {
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
      await program.parseAsync(['node', 'linear', 'teams']);
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
    await program.parseAsync(['node', 'linear', 'teams', 'list', '--json']);

    expect(process.exitCode).toBe(1);
  });
});
