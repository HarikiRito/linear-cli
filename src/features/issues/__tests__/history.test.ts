import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeHistoryResponse(overrideNodes?: object[]) {
  return {
    issue: {
      id: 'issue-uuid',
      identifier: 'ENG-1',
      history: {
        nodes: overrideNodes ?? [
          {
            id: 'hist-uuid-1',
            createdAt: '2026-06-01T10:00:00.000Z',
            actors: [{ id: 'user-uuid', name: 'Alice', displayName: 'Alice A.' }],
            updatedDescription: false,
            fromTitle: null,
            toTitle: null,
            fromState: { id: 'state-1', name: 'Todo' },
            toState: { id: 'state-2', name: 'In Progress' },
            fromDueDate: null,
            toDueDate: null,
            toConvertedProject: null,
            trashed: null,
            archived: null,
            autoArchived: null,
            autoClosed: null,
          },
          {
            id: 'hist-uuid-2',
            createdAt: '2026-06-02T10:00:00.000Z',
            actors: [{ id: 'user-uuid', name: 'Bob', displayName: 'Bob B.' }],
            updatedDescription: true,
            fromTitle: 'Old title',
            toTitle: 'New title',
            fromState: null,
            toState: null,
            fromDueDate: null,
            toDueDate: null,
            toConvertedProject: null,
            trashed: null,
            archived: null,
            autoArchived: null,
            autoClosed: null,
          },
        ],
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('listHistory', () => {
  it('renders history events in table with actor name and change summary', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeHistoryResponse());
    const capturedRows: string[][] = [];

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows.push(...rows);
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { listHistory } = await import('../history/history.js');
    await listHistory({ id: 'ENG-1', plain: false });

    expect(requestFn).toHaveBeenCalled();
    const flat = capturedRows.flat();
    // Actor name from first event
    expect(flat.some((v) => v.includes('Alice'))).toBe(true);
    // State change from first event
    expect(flat.some((v) => v.includes('Todo') && v.includes('In Progress'))).toBe(true);
    // Description changed flag from second event
    expect(flat.some((v) => v.includes('description changed'))).toBe(true);
    // Title change from second event
    expect(flat.some((v) => v.includes('Old title') && v.includes('New title'))).toBe(true);
  });

  it('outputs description caveat note', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeHistoryResponse());
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { listHistory } = await import('../history/history.js');
    await listHistory({ id: 'ENG-1', plain: false });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('description text is NOT available');
    consoleSpy.mockRestore();
  });

  it('--plain outputs plain text format', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeHistoryResponse());
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { listHistory } = await import('../history/history.js');
    await listHistory({ id: 'ENG-1', plain: true });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('HistoryEvent:');
    consoleSpy.mockRestore();
  });

  it('empty history shows empty state message', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeHistoryResponse([]));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { listHistory } = await import('../history/history.js');
    await listHistory({ id: 'ENG-1', plain: false });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('No history events found');
    consoleSpy.mockRestore();
  });
});
