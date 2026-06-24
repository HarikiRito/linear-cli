import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTeamNode(id: string, name: string, key: string) {
  return { id, name, key };
}

function makeConn(
  nodes: ReturnType<typeof makeTeamNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { nodes, pageInfo };
}

/**
 * teams/list now uses client.teams() SDK method directly (no requestFn).
 * Mock getClient to return a fake LinearClient with a `teams` method spy.
 */
function stdMocks(teamsFn: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({ teams: teamsFn })),
    getRequestFn: vi.fn(),
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
    const teamsFn = vi.fn().mockResolvedValue(makeConn([makeTeamNode('t1', 'Engineering', 'ENG')]));
    stdMocks(teamsFn);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'teams', 'list', '--json']);

    expect(teamsFn).toHaveBeenCalledOnce();
  });

  it('reads id, name, key inline from response', async () => {
    const nodes = [makeTeamNode('t1', 'Engineering', 'ENG'), makeTeamNode('t2', 'Design', 'DES')];
    const teamsFn = vi.fn().mockResolvedValue(makeConn(nodes));

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ teams: teamsFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'teams', 'list', '--json']);

    expect(teamsFn).toHaveBeenCalledOnce();
    const out = printJsonCalls[0] as { teams: { id: string; name: string; key: string }[] };
    expect(out.teams[0]).toEqual({ id: 't1', name: 'Engineering', key: 'ENG' });
    expect(out.teams[1]).toEqual({ id: 't2', name: 'Design', key: 'DES' });
  });

  it('respects --limit (passes as "first" variable)', async () => {
    const teamsFn = vi.fn().mockResolvedValue(makeConn([]));
    stdMocks(teamsFn);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'teams', 'list', '--json', '--limit', '5']);

    expect(teamsFn).toHaveBeenCalledWith(expect.objectContaining({ first: 5 }));
  });

  it('--after passes cursor in variables', async () => {
    const teamsFn = vi.fn().mockResolvedValue(makeConn([]));
    stdMocks(teamsFn);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'teams',
      'list',
      '--json',
      '--after',
      'teamCursor',
    ]);

    expect(teamsFn).toHaveBeenCalledWith(expect.objectContaining({ after: 'teamCursor' }));
  });

  it('--all fetches multiple pages (one request per page)', async () => {
    const teamsFn = vi
      .fn()
      .mockResolvedValueOnce(
        makeConn(
          Array.from({ length: 50 }, (_, i) =>
            makeTeamNode(`t${i + 1}`, `Team ${i + 1}`, `T${i + 1}`)
          ),
          { hasNextPage: true, endCursor: 'tCur1' }
        )
      )
      .mockResolvedValueOnce(
        makeConn(
          Array.from({ length: 3 }, (_, i) =>
            makeTeamNode(`t${i + 51}`, `Team ${i + 51}`, `T${i + 51}`)
          ),
          { hasNextPage: false, endCursor: null }
        )
      );

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ teams: teamsFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'teams', 'list', '--all', '--json']);

    expect(teamsFn).toHaveBeenCalledTimes(2);
    const result = printJsonCalls[0] as { teams: unknown[] };
    expect(result.teams.length).toBe(53);
  });

  it('--json output includes pageInfo with hasNextPage and endCursor', async () => {
    const teamsFn = vi.fn().mockResolvedValue(
      makeConn([makeTeamNode('t1', 'Engineering', 'ENG')], {
        hasNextPage: true,
        endCursor: 'tNext',
      })
    );

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ teams: teamsFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'teams', 'list', '--json']);

    const out = printJsonCalls[0] as { pageInfo: { hasNextPage: boolean; endCursor: string } };
    expect(out.pageInfo.hasNextPage).toBe(true);
    expect(out.pageInfo.endCursor).toBe('tNext');
  });

  it('renders Markdown by default', async () => {
    const teamsFn = vi.fn().mockResolvedValue(makeConn([makeTeamNode('t1', 'Engineering', 'ENG')]));

    const printMarkdownCalls: unknown[] = [];
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ teams: teamsFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue('TABLE'),
      printMarkdown: vi.fn().mockImplementation((s: unknown) => printMarkdownCalls.push(s)),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

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
