import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Team UUID: bypasses resolveTeam network call (looksLikeId short-circuits)
const TEAM_UUID = '11111111-1111-1111-1111-111111111111';

function makeCycleNode(
  overrides: Partial<{
    id: string;
    name: string | null;
    number: number;
    startsAt: string;
    endsAt: string;
    completedAt: string | null;
  }> = {}
) {
  return {
    id: 'cycle-uuid',
    name: 'Sprint 1',
    number: 1,
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2026-01-14T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

function makeCyclesResponse(
  nodes: ReturnType<typeof makeCycleNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { cycles: { nodes, pageInfo } };
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
  const { registerCycles } = await import('../src/features/cycles/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerCycles(program);
  return program;
}

// ---------------------------------------------------------------------------
// cycles list
// ---------------------------------------------------------------------------
describe('cycles list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });


  it('--limit passes first variable', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeCyclesResponse([]));
    stdMocks(requestFn);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'cycles',
      'list',
      '--team',
      TEAM_UUID,
      '--limit',
      '5',
    ]);

    expect(requestFn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ first: 5 })
    );
  });

  it('--all fetches multiple pages', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce(
        makeCyclesResponse(
          Array.from({ length: 2 }, (_, i) => makeCycleNode({ id: `c${i}`, number: i + 1 })),
          { hasNextPage: true, endCursor: 'cur1' }
        )
      )
      .mockResolvedValueOnce(
        makeCyclesResponse([makeCycleNode({ id: 'c2', number: 3 })], {
          hasNextPage: false,
          endCursor: null,
        })
      );

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
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
      'cycles',
      'list',
      '--team',
      TEAM_UUID,
      '--all',
    ]);

    expect(requestFn).toHaveBeenCalledTimes(2);
  });

});
