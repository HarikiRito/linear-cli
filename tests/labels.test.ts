import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLabelNode(
  overrides: Partial<{
    id: string;
    name: string;
    color: string;
    parent: { id: string } | null;
  }> = {}
) {
  return {
    id: 'label-uuid',
    name: 'bug',
    color: '#ff0000',
    parent: null,
    ...overrides,
  };
}

function makeLabelsResponse(
  nodes: ReturnType<typeof makeLabelNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { issueLabels: { nodes, pageInfo } };
}

// Team mock for resolveTeam
function makeTeamsFn(nodes = [{ id: 'team-uuid', name: 'ENG', key: 'ENG' }]) {
  return vi.fn().mockResolvedValue({ nodes });
}

function stdMocksWithRequestAndClient(
  requestFn: ReturnType<typeof vi.fn>,
  clientExtra: Record<string, unknown> = {}
) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({ ...clientExtra })),
    getRequestFn: vi.fn().mockReturnValue(requestFn),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn().mockReturnValue(''),
    printTable: vi.fn(),
  }));
  vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
}

async function buildProgram() {
  const { registerLabels } = await import('../src/features/labels/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerLabels(program);
  return program;
}

// ---------------------------------------------------------------------------
// labels list
// ---------------------------------------------------------------------------
describe('labels list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });


  it('--team passes team filter in request variables', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeLabelsResponse([]));
    const teamsFn = makeTeamsFn();

    stdMocksWithRequestAndClient(requestFn, { teams: teamsFn });

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'labels', 'list', '--team', 'ENG']);

    // resolveTeam was called
    expect(teamsFn).toHaveBeenCalled();
    // requestFn should have been called with a filter containing team id
    const [, vars] = requestFn.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(JSON.stringify(vars)).toContain('team-uuid');
  });

  it('unknown --team calls exitError with NotFoundError', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeLabelsResponse([]));
    const teamsFn = makeTeamsFn([]); // no teams found
    const exitErrorMock = vi.fn();

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ teams: teamsFn })),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'labels', 'list', '--team', 'NOPE']);

    expect(exitErrorMock).toHaveBeenCalled();
    expect(requestFn).not.toHaveBeenCalled();
  });

});

// ---------------------------------------------------------------------------
// labels create
// ---------------------------------------------------------------------------
describe('labels create', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('creates workspace-level label when --team is omitted', async () => {
    const labelPayload = {
      get issueLabel() {
        return Promise.resolve({
          id: 'label-new',
          name: 'enhancement',
          color: '#0000ff',
          get team() {
            return Promise.resolve(null);
          },
        });
      },
    };
    const createFn = vi.fn().mockResolvedValue(labelPayload);

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ createIssueLabel: createFn })),
      getRequestFn: vi.fn(),
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
      'labels',
      'create',
      '--name',
      'enhancement',
    ]);

    expect(createFn).toHaveBeenCalledOnce();
    const callArg = createFn.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg).toMatchObject({ name: 'enhancement' });
    expect(callArg).not.toHaveProperty('teamId');
  });

  it('missing --name causes Commander error', async () => {
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await expect(
      program.parseAsync(['node', 'linear', 'labels', 'create', '--team', 'ENG'])
    ).rejects.toThrow();
  });
});
