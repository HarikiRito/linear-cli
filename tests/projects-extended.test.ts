import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Project UUID: bypasses resolveProject network call (looksLikeId short-circuits)
const PROJ_UUID = '11111111-1111-1111-1111-111111111111';

function makeProjectDetailResponse(overrides: Record<string, unknown> = {}) {
  return {
    project: {
      id: PROJ_UUID,
      name: 'My Project',
      description: 'A great project',
      state: 'started',
      url: 'https://linear.app/proj/my-project',
      startDate: '2026-01-01',
      targetDate: '2026-12-31',
      lead: { id: 'user-uuid', name: 'Alice', displayName: 'Alice A.' },
      teams: { nodes: [{ id: 'team-uuid', name: 'Engineering', key: 'ENG' }] },
      members: { nodes: [{ id: 'user-uuid', name: 'Alice', displayName: 'Alice A.' }] },
      ...overrides,
    },
  };
}

function makeProjectLabelsResponse(
  nodes: { id: string; name: string; color: string; parent: { id: string } | null }[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return {
    project: {
      labels: { nodes, pageInfo },
    },
  };
}

function stdMocks(requestFn: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({})),
    getRequestFn: vi.fn().mockReturnValue(requestFn),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn().mockReturnValue(''),
    printTable: vi.fn(),
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
// projects get
// ---------------------------------------------------------------------------
describe('projects get', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('fetches project fields', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeProjectDetailResponse());

    stdMocks(requestFn);

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'projects', 'get', PROJ_UUID]);

    expect(requestFn).toHaveBeenCalledOnce();
  });

  it('unknown project calls exitError', async () => {
    const requestFn = vi.fn().mockResolvedValue({ project: null });
    const exitErrorMock = vi.fn();

    stdMocks(requestFn);
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'projects', 'get', PROJ_UUID]);

    expect(exitErrorMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// projects labels
// ---------------------------------------------------------------------------
describe('projects labels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('returns labels array for project', async () => {
    const labelNodes = [
      { id: 'label-1', name: 'bug', color: '#ff0000', parent: null },
      { id: 'label-2', name: 'feature', color: '#00ff00', parent: null },
    ];
    const requestFn = vi.fn().mockResolvedValue(makeProjectLabelsResponse(labelNodes));

    stdMocks(requestFn);

    const program = await buildProgram();
    await program.parseAsync([
      'node',
      'linear',
      'projects',
      'labels',
      '--project',
      PROJ_UUID,
    ]);

    expect(requestFn).toHaveBeenCalledOnce();
  });

  it('missing --project causes Commander error', async () => {
    const requestFn = vi.fn();
    stdMocks(requestFn);
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'projects', 'labels'])
    ).rejects.toThrow();
  });
});
