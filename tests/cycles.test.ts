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

  it('JSON has cycles array and pageInfo', async () => {
    const nodes = [
      makeCycleNode(),
      makeCycleNode({
        id: 'cycle-2',
        name: 'Sprint 2',
        number: 2,
        startsAt: '2026-01-15T00:00:00.000Z',
        endsAt: '2026-01-28T00:00:00.000Z',
        completedAt: '2026-01-28T00:00:00.000Z',
      }),
    ];
    const requestFn = vi.fn().mockResolvedValue(makeCyclesResponse(nodes));
    const printJsonCalls: unknown[] = [];

    stdMocks(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'cycles', 'list', '--team', TEAM_UUID, '--json']);

    expect(requestFn).toHaveBeenCalledOnce();
    const out = printJsonCalls[0] as {
      cycles: {
        id: string;
        name: string | null;
        number: number;
        startsAt: string;
        endsAt: string;
        completedAt: string | null;
      }[];
      pageInfo: { hasNextPage: boolean };
    };
    expect(Array.isArray(out.cycles)).toBe(true);
    expect(out.cycles.length).toBe(2);
    expect(out.cycles[0]).toMatchObject({ id: 'cycle-uuid', name: 'Sprint 1', number: 1 });
    expect('completedAt' in out.cycles[0]).toBe(true);
    expect(out.pageInfo).toBeDefined();
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
      '--json',
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
      'cycles',
      'list',
      '--team',
      TEAM_UUID,
      '--all',
      '--json',
    ]);

    expect(requestFn).toHaveBeenCalledTimes(2);
    const result = printJsonCalls[0] as { cycles: unknown[] };
    expect(result.cycles.length).toBe(3);
  });

  it('empty result exits 0 with empty cycles array', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeCyclesResponse([]));
    const printJsonCalls: unknown[] = [];

    stdMocks(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'cycles', 'list', '--team', TEAM_UUID, '--json']);

    const out = printJsonCalls[0] as { cycles: unknown[] };
    expect(out.cycles).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });
});
