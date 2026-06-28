import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('unmarkRelation', () => {
  it('calls deleteIssueRelation with the provided relation ID', async () => {
    const deleteIssueRelationFn = vi.fn().mockResolvedValue({ success: true });
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteIssueRelation: deleteIssueRelationFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { unmarkRelation } = await import('../unmark/unmark.js');
    await unmarkRelation({ relationId: 'relation-uuid-123' });

    expect(deleteIssueRelationFn).toHaveBeenCalledWith('relation-uuid-123');
  });

  it('SDK error propagates as exit error', async () => {
    const exitErrorMock = vi.fn();
    const deleteIssueRelationFn = vi.fn().mockRejectedValue(new Error('API error'));
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteIssueRelation: deleteIssueRelationFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorMock }));

    const { unmarkRelation } = await import('../unmark/unmark.js');
    await unmarkRelation({ relationId: 'bad-id' });

    expect(exitErrorMock).toHaveBeenCalled();
  });
});
