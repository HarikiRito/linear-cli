import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Team UUID: bypasses resolveTeam network call
const TEAM_UUID = '11111111-1111-1111-1111-111111111111';

function makeStatusNode(
  overrides: Partial<{
    id: string;
    name: string;
    type: string;
    color: string;
    position: number;
  }> = {}
) {
  return {
    id: 'status-uuid',
    name: 'In Progress',
    type: 'started',
    color: '#f2c94c',
    position: 1,
    ...overrides,
  };
}

function makeStatusesResponse(
  nodes: ReturnType<typeof makeStatusNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { workflowStates: { nodes, pageInfo } };
}

function stdMocks(requestFn: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    // teams fn for resolveTeam with UUID (looksLikeId short-circuits, so teams fn irrelevant)
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

function _stdMocksWithTeamName(
  requestFn: ReturnType<typeof vi.fn>,
  teamNodes = [{ id: 'team-uuid', name: 'ENG', key: 'ENG' }]
) {
  const teamsFn = vi.fn().mockResolvedValue({ nodes: teamNodes });
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({ teams: teamsFn })),
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
  const { registerStatuses } = await import('../src/features/statuses/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerStatuses(program);
  return program;
}

// ---------------------------------------------------------------------------
// statuses list
// ---------------------------------------------------------------------------
describe('statuses list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('JSON has statuses array and pageInfo', async () => {
    const nodes = [
      makeStatusNode(),
      makeStatusNode({
        id: 'status-2',
        name: 'Done',
        type: 'completed',
        color: '#27ae60',
        position: 2,
      }),
    ];
    const requestFn = vi.fn().mockResolvedValue(makeStatusesResponse(nodes));
    const printJsonCalls: unknown[] = [];

    stdMocks(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'statuses', 'list', '--team', TEAM_UUID, '--json']);

    expect(requestFn).toHaveBeenCalledOnce();
    const out = printJsonCalls[0] as {
      statuses: { id: string; name: string; type: string; color: string; position: number }[];
      pageInfo: { hasNextPage: boolean };
    };
    expect(Array.isArray(out.statuses)).toBe(true);
    expect(out.statuses.length).toBe(2);
    expect(out.statuses[0]).toMatchObject({
      id: 'status-uuid',
      name: 'In Progress',
      type: 'started',
      color: '#f2c94c',
      position: 1,
    });
    expect(out.pageInfo).toBeDefined();
  });

  it('scopes filter to resolved team id', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeStatusesResponse([]));
    stdMocks(requestFn);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'statuses', 'list', '--team', TEAM_UUID, '--json']);

    const [, vars] = requestFn.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(JSON.stringify(vars)).toContain(TEAM_UUID);
  });
});

// ---------------------------------------------------------------------------
// statuses get
// ---------------------------------------------------------------------------
describe('statuses get', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('--name resolves status by name in team', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue(makeStatusesResponse([makeStatusNode({ name: 'In Progress' })]));
    const printJsonCalls: unknown[] = [];

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));
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
    await program.parseAsync([
      'node',
      'linear',
      'statuses',
      'get',
      '--team',
      TEAM_UUID,
      '--name',
      'In Progress',
      '--json',
    ]);

    const out = printJsonCalls[0] as { status: { name: string } };
    expect(out.status).toMatchObject({ name: 'In Progress' });
  });

  it('--id fetches status by id', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue(makeStatusesResponse([makeStatusNode({ id: 'sid-123' })]));
    const printJsonCalls: unknown[] = [];

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));
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
    await program.parseAsync([
      'node',
      'linear',
      'statuses',
      'get',
      '--team',
      TEAM_UUID,
      '--id',
      'sid-123',
      '--json',
    ]);

    const out = printJsonCalls[0] as { status: { id: string } };
    expect(out.status).toMatchObject({ id: 'sid-123' });
  });

  it('missing --name and --id calls exitError with ValidationError', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeStatusesResponse([]));
    const exitErrorMock = vi.fn();

    stdMocks(requestFn);
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'statuses', 'get', '--team', TEAM_UUID]);

    expect(exitErrorMock).toHaveBeenCalled();
    expect(requestFn).not.toHaveBeenCalled();
  });

  it('ambiguous name calls exitError with AmbiguousMatchError', async () => {
    // Two statuses with same name
    const requestFn = vi
      .fn()
      .mockResolvedValue(
        makeStatusesResponse([
          makeStatusNode({ id: 'sid-1', name: 'Duplicate' }),
          makeStatusNode({ id: 'sid-2', name: 'Duplicate' }),
        ])
      );
    const exitErrorMock = vi.fn();

    stdMocks(requestFn);
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync([
      'node',
      'linear',
      'statuses',
      'get',
      '--team',
      TEAM_UUID,
      '--name',
      'Duplicate',
      '--json',
    ]);

    expect(exitErrorMock).toHaveBeenCalled();
  });

  it('not found name calls exitError with NotFoundError', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeStatusesResponse([]));
    const exitErrorMock = vi.fn();

    stdMocks(requestFn);
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync([
      'node',
      'linear',
      'statuses',
      'get',
      '--team',
      TEAM_UUID,
      '--name',
      'Nope',
      '--json',
    ]);

    expect(exitErrorMock).toHaveBeenCalled();
  });
});
