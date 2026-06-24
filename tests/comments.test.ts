import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

function stdMocks(request: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({ client: { request } })),
    getRequestFn: (c: { client: { request: typeof request } }) => c.client.request,
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
  const { registerIssues } = await import('../src/features/issues/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerIssues(program);
  return program;
}

// ---------------------------------------------------------------------------
// comment list
// ---------------------------------------------------------------------------
describe('comment list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('fetches comments for issue', async () => {
    const request = vi.fn().mockResolvedValue({
      issue: {
        comments: {
          nodes: [
            {
              id: 'c1',
              body: 'Hello',
              createdAt: '2024-01-01',
              parentId: null,
              user: { name: 'Alice' },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'comment', 'list', 'ISSUE-1', '--json']);

    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('ListComments'),
      expect.objectContaining({ issueId: 'ISSUE-1' })
    );
  });
});

// ---------------------------------------------------------------------------
// comment add
// ---------------------------------------------------------------------------
describe('comment add', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls commentCreate with issueId and body', async () => {
    const request = vi.fn().mockResolvedValue({
      commentCreate: {
        success: true,
        comment: {
          id: 'c1',
          body: 'hi',
          url: 'https://linear.app/c1',
          createdAt: '2024-01-01',
          user: { name: 'Alice' },
        },
      },
    });
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'comment',
      'add',
      'ISSUE-1',
      '--body',
      'hi',
      '--json',
    ]);

    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('commentCreate'),
      expect.objectContaining({
        input: expect.objectContaining({ issueId: 'ISSUE-1', body: 'hi' }),
      })
    );
  });

  it('reads body from stdin when --body -', async () => {
    const request = vi.fn().mockResolvedValue({
      commentCreate: {
        success: true,
        comment: {
          id: 'c1',
          body: 'stdin body',
          url: '',
          createdAt: '2024-01-01',
          user: null,
        },
      },
    });
    stdMocks(request);
    vi.doMock('../src/lib/stdin.js', () => ({
      readStdin: vi.fn().mockResolvedValue('stdin body'),
    }));

    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'comment',
      'add',
      'ISSUE-1',
      '--body',
      '-',
      '--json',
    ]);

    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('commentCreate'),
      expect.objectContaining({
        input: expect.objectContaining({ body: 'stdin body' }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// comment reply
// ---------------------------------------------------------------------------
describe('comment reply', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls exitError with NotFoundError and does not send mutation when comment is null', async () => {
    const request = vi.fn()
      // First call: FetchCommentIssue returns null comment
      .mockResolvedValueOnce({ comment: null });
    const exitErrorMock = vi.fn();
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ client: { request } })),
    getRequestFn: (c: { client: { request: typeof request } }) => c.client.request,
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildProgram();
    await program.parseAsync([
      'node', 'linear', 'issues', 'comment', 'reply', 'MISSING-COMMENT', '--body', 'hi',
    ]);

    expect(exitErrorMock).toHaveBeenCalledOnce();
    const err = exitErrorMock.mock.calls[0][0] as { kind: string };
    expect(err.kind).toBe('NotFoundError');
    // Mutation must NOT have been called
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('fetches parent issue id then sends issueId + parentId in commentCreate', async () => {
    const request = vi.fn()
      // First call: FetchCommentIssue lookup
      .mockResolvedValueOnce({ comment: { issue: { id: 'ISSUE-UUID-1' } } })
      // Second call: commentCreate mutation
      .mockResolvedValueOnce({
        commentCreate: {
          success: true,
          comment: { id: 'c2', body: 'reply', url: '', createdAt: '2024-01-01', user: null },
        },
      });
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'comment',
      'reply',
      'COMMENT-1',
      '--body',
      'reply',
      '--json',
    ]);

    // First request: lookup query with the parent comment id
    const [lookupQuery, lookupVars] = request.mock.calls[0] as [string, Record<string, unknown>];
    expect(lookupQuery).toContain('FetchCommentIssue');
    expect(lookupVars).toMatchObject({ id: 'COMMENT-1' });

    // Second request: mutation with both issueId and parentId
    const [, mutationVars] = request.mock.calls[1] as [string, { input: Record<string, unknown> }];
    expect(mutationVars.input).toMatchObject({ issueId: 'ISSUE-UUID-1', parentId: 'COMMENT-1' });
  });
});

// ---------------------------------------------------------------------------
// comment update
// ---------------------------------------------------------------------------
describe('comment update', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls commentUpdate with id and body', async () => {
    const request = vi.fn().mockResolvedValue({
      commentUpdate: {
        success: true,
        comment: { id: 'COMMENT-1', body: 'edited', url: '', createdAt: '2024-01-01', user: null },
      },
    });
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'comment',
      'update',
      'COMMENT-1',
      '--body',
      'edited',
      '--json',
    ]);

    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('commentUpdate'),
      expect.objectContaining({
        id: 'COMMENT-1',
        input: expect.objectContaining({ body: 'edited' }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// comment delete
// ---------------------------------------------------------------------------
describe('comment delete', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('skips prompt with --yes and calls commentDelete', async () => {
    const request = vi.fn().mockResolvedValue({ commentDelete: { success: true } });
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'comment',
      'delete',
      'COMMENT-1',
      '--yes',
    ]);

    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('commentDelete'),
      expect.objectContaining({ id: 'COMMENT-1' })
    );
  });

  it('errors in non-TTY without --yes (does not call delete)', async () => {
    const request = vi.fn();
    const exitErrorMock = vi.fn();
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ client: { request } })),
    getRequestFn: (c: { client: { request: typeof request } }) => c.client.request,
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    // Simulate non-TTY
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'comment', 'delete', 'COMMENT-1']);

    expect(exitErrorMock).toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
