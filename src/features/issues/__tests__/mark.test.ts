import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeClientMock(overrides: Record<string, unknown>) {
  return overrides;
}

function stdMocks(clientMock: ReturnType<typeof makeClientMock>) {
  vi.doMock('../../../lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok(clientMock)),
    getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
    getRequestFn: vi.fn(),
  }));
  vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('markRelation', () => {
  it('related-to: calls createIssueRelation with type=related, correct issueId/relatedIssueId', async () => {
    const createIssueRelationFn = vi.fn().mockResolvedValue({ success: true });
    const clientMock = makeClientMock({ createIssueRelation: createIssueRelationFn });
    stdMocks(clientMock);

    const { markRelation } = await import('../mark/mark.js');
    await markRelation({ relation: 'related-to', issue: 'ENG-1', target: 'ENG-2' });

    expect(createIssueRelationFn).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: 'ENG-1', relatedIssueId: 'ENG-2', type: 'related' })
    );
  });

  it('blocking: calls createIssueRelation with type=blocks, issueId=A, relatedIssueId=B', async () => {
    const createIssueRelationFn = vi.fn().mockResolvedValue({ success: true });
    const clientMock = makeClientMock({ createIssueRelation: createIssueRelationFn });
    stdMocks(clientMock);

    const { markRelation } = await import('../mark/mark.js');
    await markRelation({ relation: 'blocking', issue: 'ENG-1', target: 'ENG-2' });

    expect(createIssueRelationFn).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: 'ENG-1', relatedIssueId: 'ENG-2', type: 'blocks' })
    );
  });

  it('blocked-by: SWAPS ids so issueId=target, relatedIssueId=issue', async () => {
    const createIssueRelationFn = vi.fn().mockResolvedValue({ success: true });
    const clientMock = makeClientMock({ createIssueRelation: createIssueRelationFn });
    stdMocks(clientMock);

    const { markRelation } = await import('../mark/mark.js');
    await markRelation({ relation: 'blocked-by', issue: 'ENG-1', target: 'ENG-2' });

    expect(createIssueRelationFn).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: 'ENG-2', relatedIssueId: 'ENG-1', type: 'blocks' })
    );
  });

  it('duplicate-of: calls createIssueRelation with type=duplicate', async () => {
    const createIssueRelationFn = vi.fn().mockResolvedValue({ success: true });
    const clientMock = makeClientMock({ createIssueRelation: createIssueRelationFn });
    stdMocks(clientMock);

    const { markRelation } = await import('../mark/mark.js');
    await markRelation({ relation: 'duplicate-of', issue: 'ENG-1', target: 'ENG-2' });

    expect(createIssueRelationFn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'duplicate' })
    );
  });

  it('parent-of: calls updateIssue on target with parentId=issueId', async () => {
    const updateIssueFn = vi.fn().mockResolvedValue({ success: true });
    const clientMock = makeClientMock({ updateIssue: updateIssueFn });
    stdMocks(clientMock);

    const { markRelation } = await import('../mark/mark.js');
    await markRelation({ relation: 'parent-of', issue: 'ENG-1', target: 'ENG-2' });

    expect(updateIssueFn).toHaveBeenCalledWith('ENG-2', expect.objectContaining({ parentId: 'ENG-1' }));
  });

  it('sub-issue-of: calls updateIssue on issue with parentId=targetId', async () => {
    const updateIssueFn = vi.fn().mockResolvedValue({ success: true });
    const clientMock = makeClientMock({ updateIssue: updateIssueFn });
    stdMocks(clientMock);

    const { markRelation } = await import('../mark/mark.js');
    await markRelation({ relation: 'sub-issue-of', issue: 'ENG-1', target: 'ENG-2' });

    expect(updateIssueFn).toHaveBeenCalledWith('ENG-1', expect.objectContaining({ parentId: 'ENG-2' }));
  });

  it('invalid relation: calls exitError with ValidationError, no SDK call', async () => {
    const createIssueRelationFn = vi.fn();
    const exitErrorMock = vi.fn();
    const clientMock = makeClientMock({ createIssueRelation: createIssueRelationFn });
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorMock }));

    const { markRelation } = await import('../mark/mark.js');
    await markRelation({ relation: 'foobar', issue: 'ENG-1', target: 'ENG-2' });

    expect(exitErrorMock).toHaveBeenCalledOnce();
    const err = exitErrorMock.mock.calls[0][0] as { kind: string; message: string };
    expect(err.kind).toBe('ValidationError');
    expect(err.message).toContain('foobar');
    expect(err.message).toContain('related-to');
    expect(createIssueRelationFn).not.toHaveBeenCalled();
  });
});
