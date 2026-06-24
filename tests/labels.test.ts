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

  it('JSON has labels array and pageInfo', async () => {
    const nodes = [
      makeLabelNode(),
      makeLabelNode({ id: 'label-2', name: 'feature', color: '#00ff00' }),
    ];
    const requestFn = vi.fn().mockResolvedValue(makeLabelsResponse(nodes));
    const printJsonCalls: unknown[] = [];

    stdMocksWithRequestAndClient(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'labels', 'list', '--json']);

    expect(requestFn).toHaveBeenCalledOnce();
    const out = printJsonCalls[0] as {
      labels: { id: string; name: string; color: string; parentId: string | null }[];
      pageInfo: { hasNextPage: boolean };
    };
    expect(Array.isArray(out.labels)).toBe(true);
    expect(out.labels.length).toBe(2);
    expect(out.labels[0]).toMatchObject({
      id: 'label-uuid',
      name: 'bug',
      color: '#ff0000',
      parentId: null,
    });
    expect(out.pageInfo).toBeDefined();
  });

  it('--team passes team filter in request variables', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeLabelsResponse([]));
    const teamsFn = makeTeamsFn();

    stdMocksWithRequestAndClient(requestFn, { teams: teamsFn });

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'labels', 'list', '--team', 'ENG', '--json']);

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
    await program.parseAsync(['node', 'linear', 'labels', 'list', '--team', 'NOPE', '--json']);

    expect(exitErrorMock).toHaveBeenCalled();
    expect(requestFn).not.toHaveBeenCalled();
  });

  it('empty result exits 0 with empty labels array', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeLabelsResponse([]));
    const printJsonCalls: unknown[] = [];

    stdMocksWithRequestAndClient(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'labels', 'list', '--json']);

    const out = printJsonCalls[0] as { labels: unknown[] };
    expect(out.labels).toEqual([]);
    expect(process.exitCode).toBeUndefined();
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
    const printJsonCalls: unknown[] = [];

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ createIssueLabel: createFn })),
      getRequestFn: vi.fn(),
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
      'labels',
      'create',
      '--name',
      'enhancement',
      '--json',
    ]);

    expect(createFn).toHaveBeenCalledOnce();
    const callArg = createFn.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg).toMatchObject({ name: 'enhancement' });
    expect(callArg).not.toHaveProperty('teamId');

    const out = printJsonCalls[0] as { label: { id: string; name: string; teamId: string | null } };
    expect(out.label.id).toBe('label-new');
    expect(out.label.teamId).toBeNull();
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
