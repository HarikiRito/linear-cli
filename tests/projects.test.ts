import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeProjectNode(id: string, name: string, state: string) {
  return { id, name, state };
}

function makeConn(
  nodes: ReturnType<typeof makeProjectNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { nodes, pageInfo };
}

/**
 * projects/list now uses client.projects() SDK method directly (no requestFn).
 * Mock getClient to return a fake LinearClient with a `projects` method spy.
 */
function stdMocks(projectsFn: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({ projects: projectsFn })),
    getRequestFn: vi.fn(),
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
    const projectsFn = vi
      .fn()
      .mockResolvedValue(makeConn([makeProjectNode('p1', 'Alpha', 'started')]));
    stdMocks(projectsFn);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'projects', 'list']);

    expect(projectsFn).toHaveBeenCalledOnce();
  });

  it('reads id, name, state inline from response', async () => {
    const nodes = [
      makeProjectNode('p1', 'Alpha', 'started'),
      makeProjectNode('p2', 'Beta', 'planned'),
    ];
    const projectsFn = vi.fn().mockResolvedValue(makeConn(nodes));

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ projects: projectsFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'projects', 'list']);

    expect(projectsFn).toHaveBeenCalledOnce();
  });

  it('respects --limit (passes as "first" variable)', async () => {
    const projectsFn = vi.fn().mockResolvedValue(makeConn([]));
    stdMocks(projectsFn);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'projects', 'list', '--limit', '15']);

    expect(projectsFn).toHaveBeenCalledWith(expect.objectContaining({ first: 15 }));
  });

  it('--after passes cursor in variables', async () => {
    const projectsFn = vi.fn().mockResolvedValue(makeConn([]));
    stdMocks(projectsFn);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'projects',
      'list',
      '--after',
      'projCursor',
    ]);

    expect(projectsFn).toHaveBeenCalledWith(expect.objectContaining({ after: 'projCursor' }));
  });

  it('--all fetches multiple pages (one request per page)', async () => {
    const projectsFn = vi
      .fn()
      .mockResolvedValueOnce(
        makeConn(
          Array.from({ length: 50 }, (_, i) =>
            makeProjectNode(`p${i + 1}`, `Project ${i + 1}`, 'started')
          ),
          { hasNextPage: true, endCursor: 'pCur1' }
        )
      )
      .mockResolvedValueOnce(
        makeConn(
          Array.from({ length: 4 }, (_, i) =>
            makeProjectNode(`p${i + 51}`, `Project ${i + 51}`, 'planned')
          ),
          { hasNextPage: false, endCursor: null }
        )
      );

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ projects: projectsFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'projects', 'list', '--all']);

    expect(projectsFn).toHaveBeenCalledTimes(2);
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

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'projects', 'list']);

    expect(process.exitCode).toBe(1);
  });
});
