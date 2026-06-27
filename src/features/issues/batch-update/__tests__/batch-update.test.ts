import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/client/index.js', () => ({
  getClientWithAuthRetry: vi.fn(),
}));

vi.mock('../../update/update.js', () => ({
  resolveUpdateInput: vi.fn(),
}));

import { ok, okAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../../lib/client/index.js';
import { resolveUpdateInput } from '../../update/update.js';
import {
  BATCH_CHUNK_SIZE,
  batchUpdateIssues,
  formatSummary,
  parseIds,
  runBatchUpdate,
  type IssueUpdateResult,
} from '../batch-update.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssueMock(stateName = 'Todo') {
  const stateMock = { name: stateName };
  return {
    id: 'uuid-1',
    identifier: 'ENG-1',
    title: 'Test Issue',
    url: 'https://linear.app/issue/ENG-1',
    get state() {
      return Promise.resolve(stateMock);
    },
  };
}

function makePayloadMock(issueMock = makeIssueMock()) {
  return {
    get issue() {
      return Promise.resolve(issueMock);
    },
  };
}

// ---------------------------------------------------------------------------
// parseIds — pure function tests
// ---------------------------------------------------------------------------

describe('parseIds', () => {
  it('space-separated only: returns each arg as its own ID', () => {
    expect(parseIds(['ENG-1', 'ENG-2', 'ENG-3'])).toEqual(['ENG-1', 'ENG-2', 'ENG-3']);
  });

  it('comma-separated within a single arg: splits into individual IDs', () => {
    expect(parseIds(['ENG-1,ENG-2,ENG-3'])).toEqual(['ENG-1', 'ENG-2', 'ENG-3']);
  });

  it('mixed comma and space: flattens all IDs correctly', () => {
    expect(parseIds(['ENG-1', 'ENG-2,ENG-3', 'ENG-4'])).toEqual([
      'ENG-1',
      'ENG-2',
      'ENG-3',
      'ENG-4',
    ]);
  });

  it('empty args: returns empty array', () => {
    expect(parseIds([])).toEqual([]);
  });

  it('deduplicates repeated IDs', () => {
    expect(parseIds(['ENG-1', 'ENG-2', 'ENG-1,ENG-2'])).toEqual(['ENG-1', 'ENG-2']);
  });

  it('trims whitespace around comma-separated IDs', () => {
    expect(parseIds([' ENG-1 , ENG-2 '])).toEqual(['ENG-1', 'ENG-2']);
  });
});

// ---------------------------------------------------------------------------
// formatSummary — pure function tests
// ---------------------------------------------------------------------------

describe('formatSummary', () => {
  it('correct arithmetic: 3 Ok + 2 Err = "3 updated, 2 failed"', () => {
    const results: IssueUpdateResult[] = [
      { ok: true, issue: { id: '1', identifier: 'ENG-1', title: 'A', url: '', state: '' } },
      { ok: true, issue: { id: '2', identifier: 'ENG-2', title: 'B', url: '', state: '' } },
      { ok: true, issue: { id: '3', identifier: 'ENG-3', title: 'C', url: '', state: '' } },
      { ok: false, id: 'ENG-4', error: 'not found' },
      { ok: false, id: 'ENG-5', error: 'network error' },
    ];
    expect(formatSummary(results)).toBe('3 updated, 2 failed');
  });

  it('all success: "N updated, 0 failed"', () => {
    const results: IssueUpdateResult[] = [
      { ok: true, issue: { id: '1', identifier: 'ENG-1', title: 'A', url: '', state: '' } },
    ];
    expect(formatSummary(results)).toBe('1 updated, 0 failed');
  });

  it('all fail: "0 updated, N failed"', () => {
    const results: IssueUpdateResult[] = [
      { ok: false, id: 'ENG-1', error: 'not found' },
      { ok: false, id: 'ENG-2', error: 'not found' },
    ];
    expect(formatSummary(results)).toBe('0 updated, 2 failed');
  });
});

// ---------------------------------------------------------------------------
// runBatchUpdate — bounded concurrency + aggregation tests
// ---------------------------------------------------------------------------

describe('runBatchUpdate', () => {
  it('partial failure: one Ok and one Err in results', async () => {
    const updateFn = vi.fn(async (id: string): Promise<IssueUpdateResult> => {
      if (id === 'ENG-1') {
        return { ok: true, issue: { id: 'id-1', identifier: 'ENG-1', title: 'T', url: '', state: 'Done' } };
      }
      return { ok: false, id, error: 'not found' };
    });

    const results = await runBatchUpdate(['ENG-1', 'ENG-2'], updateFn);

    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
    if (!results[1].ok) {
      expect(results[1].error).toBe('not found');
    }
  });

  it('all fail: all results have ok=false', async () => {
    const updateFn = vi.fn(
      async (id: string): Promise<IssueUpdateResult> => ({ ok: false, id, error: 'err' })
    );

    const results = await runBatchUpdate(['ENG-1', 'ENG-2'], updateFn);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(formatSummary(results)).toBe('0 updated, 2 failed');
  });

  it('all succeed: all results have ok=true', async () => {
    const updateFn = vi.fn(
      async (id: string): Promise<IssueUpdateResult> => ({
        ok: true,
        issue: { id: `id-${id}`, identifier: id, title: 'T', url: '', state: 'Done' },
      })
    );

    const results = await runBatchUpdate(['ENG-1'], updateFn);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('bounded concurrency: peak concurrent calls never exceeds BATCH_CHUNK_SIZE', async () => {
    let concurrentCount = 0;
    let peakConcurrent = 0;

    const updateFn = vi.fn(async (id: string): Promise<IssueUpdateResult> => {
      concurrentCount++;
      peakConcurrent = Math.max(peakConcurrent, concurrentCount);

      // Small async delay to allow concurrent tasks to overlap
      await new Promise<void>((resolve) => setImmediate(resolve));

      concurrentCount--;
      return {
        ok: true,
        issue: { id: `id-${id}`, identifier: id, title: 'T', url: '', state: 'Done' },
      };
    });

    const ids = Array.from({ length: 10 }, (_, i) => `ENG-${i + 1}`);
    await runBatchUpdate(ids, updateFn);

    expect(peakConcurrent).toBeLessThanOrEqual(BATCH_CHUNK_SIZE);
    expect(updateFn).toHaveBeenCalledTimes(10);
  });

  it('processes all IDs even across multiple chunks', async () => {
    const processed: string[] = [];
    const updateFn = vi.fn(async (id: string): Promise<IssueUpdateResult> => {
      processed.push(id);
      return {
        ok: true,
        issue: { id: `id-${id}`, identifier: id, title: 'T', url: '', state: 'Done' },
      };
    });

    const ids = Array.from({ length: 7 }, (_, i) => `ENG-${i + 1}`);
    const results = await runBatchUpdate(ids, updateFn);

    expect(results).toHaveLength(7);
    expect(processed).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Exit code logic — exercises the real batchUpdateIssues production path
// ---------------------------------------------------------------------------

describe('exit code logic', () => {
  let originalExitCode: number | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = 0;
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('sets process.exitCode=1 when any update fails', async () => {
    const updateIssueFn = vi
      .fn()
      .mockResolvedValueOnce(makePayloadMock())
      .mockRejectedValueOnce(new Error('not found'));

    vi.mocked(getClientWithAuthRetry).mockResolvedValue(ok({ updateIssue: updateIssueFn } as any));
    vi.mocked(resolveUpdateInput).mockReturnValue(okAsync({}) as any);

    await batchUpdateIssues({ ids: ['ENG-1', 'ENG-2'], plain: false });

    expect(process.exitCode).toBe(1);
  });

  it('leaves process.exitCode unchanged when all updates succeed', async () => {
    const updateIssueFn = vi.fn().mockResolvedValue(makePayloadMock());

    vi.mocked(getClientWithAuthRetry).mockResolvedValue(ok({ updateIssue: updateIssueFn } as any));
    vi.mocked(resolveUpdateInput).mockReturnValue(okAsync({}) as any);

    await batchUpdateIssues({ ids: ['ENG-1'], plain: false });

    expect(process.exitCode).toBe(0);
  });

  it('resolveUpdateInput is called exactly once regardless of ID count', async () => {
    const updateIssueFn = vi.fn().mockResolvedValue(makePayloadMock());

    vi.mocked(getClientWithAuthRetry).mockResolvedValue(ok({ updateIssue: updateIssueFn } as any));
    vi.mocked(resolveUpdateInput).mockReturnValue(okAsync({ title: 'Shared' }) as any);

    await batchUpdateIssues({ ids: ['ENG-1', 'ENG-2', 'ENG-3'], plain: false });

    expect(resolveUpdateInput).toHaveBeenCalledTimes(1);
    expect(updateIssueFn).toHaveBeenCalledTimes(3);
  });
});
