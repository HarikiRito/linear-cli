import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMilestoneNode(
  id = 'mile-uuid',
  name = 'Milestone 1',
  targetDate: string | null = '2026-12-31',
  description: string | null = null
) {
  return { id, name, targetDate, description };
}

function makeMilestoneConn(
  nodes: ReturnType<typeof makeMilestoneNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { nodes, pageInfo };
}

function makeMilestoneDetail(overrides: Partial<ReturnType<typeof makeMilestoneNode>> = {}) {
  return {
    id: 'mile-uuid',
    name: 'Milestone 1',
    targetDate: '2026-12-31',
    description: null,
    progress: 0.5,
    sortOrder: 0,
    project: { id: 'proj-uuid', name: 'My Project' },
    ...overrides,
  };
}

function makeMilestoneResult(m = makeMilestoneDetail()) {
  return {
    id: m.id,
    name: m.name,
    targetDate: m.targetDate,
    description: m.description,
    progress: m.progress,
    sortOrder: m.sortOrder,
    get project() {
      return Promise.resolve(m.project);
    },
  };
}

function makeMilestonePayload(milestoneObj = makeMilestoneResult()) {
  return {
    get projectMilestone() {
      return Promise.resolve(milestoneObj);
    },
  };
}

function makeClientMock(overrides: Record<string, unknown>) {
  return overrides;
}

/**
 * milestones list uses requestFn for the query and client.projects() for resolveProject.
 * milestones get uses requestFn for the query.
 * milestones create/update/delete use SDK client methods.
 */
function stdMocksWithRequest(
  requestFn: ReturnType<typeof vi.fn>,
  clientOverrides: Record<string, unknown> = {}
) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({ ...clientOverrides })),
    getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ ...clientOverrides })),
    getRequestFn: vi.fn().mockReturnValue(requestFn),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn().mockReturnValue(''),
    printTable: vi.fn(),
  }));
  vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
}

function stdMocksWithClient(clientMock: ReturnType<typeof makeClientMock>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok(clientMock)),
    getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
    getRequestFn: vi.fn(),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn().mockReturnValue(''),
    printTable: vi.fn(),
  }));
  vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
}

async function buildProgram() {
  const { registerMilestones } = await import('../src/features/milestones/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerMilestones(program);
  return program;
}

// Use a UUID-like project ID so resolveProject short-circuits (looksLikeId)
const PROJ_ID = '11111111-1111-1111-1111-111111111111';
const MILE_ID = 'mile-uuid-1234';

// ---------------------------------------------------------------------------
// milestones list
// ---------------------------------------------------------------------------
describe('milestones list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('missing --project causes Commander error', async () => {
    const requestFn = vi.fn();
    stdMocksWithRequest(requestFn);
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'milestones', 'list'])
    ).rejects.toThrow();
  });


});

// ---------------------------------------------------------------------------
// milestones get
// ---------------------------------------------------------------------------
describe('milestones get', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });


  it('unknown ID calls exitError with NotFoundError', async () => {
    const requestFn = vi.fn().mockResolvedValue({ projectMilestone: null });
    stdMocksWithRequest(requestFn);
    const exitErrorMock = vi.fn();
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'milestones', 'get', 'bad-id']);

    expect(exitErrorMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// milestones create
// ---------------------------------------------------------------------------
describe('milestones create', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls createProjectMilestone with name and projectId', async () => {
    const createFn = vi.fn().mockResolvedValue(makeMilestonePayload());
    const clientMock = makeClientMock({ createProjectMilestone: createFn });
    stdMocksWithClient(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'milestones',
      'create',
      '--project',
      PROJ_ID,
      '--name',
      'M1',
    ]);

    expect(createFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'M1', projectId: PROJ_ID })
    );
  });

  it('--target-date is passed to mutation', async () => {
    const createFn = vi.fn().mockResolvedValue(makeMilestonePayload());
    const clientMock = makeClientMock({ createProjectMilestone: createFn });
    stdMocksWithClient(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'milestones',
      'create',
      '--project',
      PROJ_ID,
      '--name',
      'M1',
      '--target-date',
      '2026-12-31',
    ]);

    expect(createFn).toHaveBeenCalledWith(expect.objectContaining({ targetDate: '2026-12-31' }));
  });

  it('missing --project causes Commander error', async () => {
    const clientMock = makeClientMock({});
    stdMocksWithClient(clientMock);
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'milestones', 'create', '--name', 'M1'])
    ).rejects.toThrow();
  });

  it('missing --name causes Commander error', async () => {
    const clientMock = makeClientMock({});
    stdMocksWithClient(clientMock);
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'milestones', 'create', '--project', PROJ_ID])
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// milestones update
// ---------------------------------------------------------------------------
describe('milestones update', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls updateProjectMilestone with only provided fields (name only)', async () => {
    const updateFn = vi.fn().mockResolvedValue(makeMilestonePayload());
    const clientMock = makeClientMock({ updateProjectMilestone: updateFn });
    stdMocksWithClient(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'milestones',
      'update',
      MILE_ID,
      '--name',
      'NewName',
    ]);

    expect(updateFn).toHaveBeenCalledWith(MILE_ID, { name: 'NewName' });
  });

  it('only target-date provided — no other fields in patch', async () => {
    const updateFn = vi.fn().mockResolvedValue(makeMilestonePayload());
    const clientMock = makeClientMock({ updateProjectMilestone: updateFn });
    stdMocksWithClient(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'milestones',
      'update',
      MILE_ID,
      '--target-date',
      '2027-01-01',
    ]);

    expect(updateFn).toHaveBeenCalledWith(MILE_ID, { targetDate: '2027-01-01' });
  });
});

// ---------------------------------------------------------------------------
// milestones delete
// ---------------------------------------------------------------------------
describe('milestones delete', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('--yes calls deleteProjectMilestone and exits 0', async () => {
    const deleteFn = vi.fn().mockResolvedValue({});
    const clientMock = makeClientMock({ deleteProjectMilestone: deleteFn });
    stdMocksWithClient(clientMock);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'milestones', 'delete', MILE_ID, '--yes']);

    expect(deleteFn).toHaveBeenCalledWith(MILE_ID);
    expect(process.exitCode).toBeUndefined();
  });

  it('non-TTY without --yes calls exitError (delete fn NOT called)', async () => {
    const deleteFn = vi.fn();
    const exitErrorMock = vi.fn();
    const clientMock = makeClientMock({ deleteProjectMilestone: deleteFn });
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok(clientMock)),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    // Ensure non-TTY
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'milestones', 'delete', MILE_ID]);

    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });

    expect(exitErrorMock).toHaveBeenCalled();
    const errArg = exitErrorMock.mock.calls[0][0] as Error;
    expect(errArg.message).toMatch(/--yes.*non-interactively/i);
    expect(deleteFn).not.toHaveBeenCalled();
  });
});
