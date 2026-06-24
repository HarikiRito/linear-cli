import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Build a mock LinearClient for comment operations.
 * Mutations (add/update/delete/reply) use SDK methods.
 * Comment list still uses requestFn + TypedDocumentNode.
 */
function makeClientMock(
  overrides: Partial<{
    createComment: ReturnType<typeof vi.fn>;
    updateComment: ReturnType<typeof vi.fn>;
    deleteComment: ReturnType<typeof vi.fn>;
    comment: ReturnType<typeof vi.fn>;
  }>
) {
  return overrides;
}

function stdMocks(clientMock: ReturnType<typeof makeClientMock>, requestFn?: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok(clientMock)),
    getRequestFn: requestFn ? vi.fn().mockReturnValue(requestFn) : vi.fn(),
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
    // comment list uses requestFn + TypedDocumentNode (LIST_COMMENTS_QUERY)
    const requestFn = vi.fn().mockResolvedValue({
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
    stdMocks({}, requestFn);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'comment', 'list', 'ISSUE-1', '--json']);

    // requestFn is now called with (TypedDocumentNode, vars) — check that it was called
    // with the correct variables (second arg); the doc is a DocumentNode object (not a string).
    expect(requestFn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
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
    const userMock = { name: 'Alice' };
    const commentMock = {
      id: 'c1',
      body: 'hi',
      url: 'https://linear.app/c1',
      createdAt: new Date('2024-01-01'),
      get user() { return Promise.resolve(userMock); },
    };
    const payloadMock = { get comment() { return Promise.resolve(commentMock); } };
    const createCommentFn = vi.fn().mockResolvedValue(payloadMock);
    stdMocks(makeClientMock({ createComment: createCommentFn }));
    const program = await buildProgram();

    await program.parseAsync([
      'node', 'linear', 'issues', 'comment', 'add', 'ISSUE-1', '--body', 'hi', '--json',
    ]);

    expect(createCommentFn).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: 'ISSUE-1', body: 'hi' })
    );
  });

  it('reads body from stdin when --body -', async () => {
    const userMock = null;
    const commentMock = {
      id: 'c1',
      body: 'stdin body',
      url: '',
      createdAt: new Date('2024-01-01'),
      get user() { return Promise.resolve(userMock); },
    };
    const payloadMock = { get comment() { return Promise.resolve(commentMock); } };
    const createCommentFn = vi.fn().mockResolvedValue(payloadMock);
    stdMocks(makeClientMock({ createComment: createCommentFn }));
    vi.doMock('../src/lib/stdin.js', () => ({
      readStdin: vi.fn().mockResolvedValue('stdin body'),
    }));

    const program = await buildProgram();

    await program.parseAsync([
      'node', 'linear', 'issues', 'comment', 'add', 'ISSUE-1', '--body', '-', '--json',
    ]);

    expect(createCommentFn).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'stdin body' })
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

  it('calls exitError with NotFoundError and does not send mutation when issueId is null', async () => {
    // Raw query returns comment with null issueId → NotFoundError
    const requestFn = vi.fn().mockResolvedValue({ comment: { issueId: null } });
    const createCommentFn = vi.fn();
    const exitErrorMock = vi.fn();

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok(makeClientMock({ createComment: createCommentFn }))),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
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
    expect(createCommentFn).not.toHaveBeenCalled();
  });

  it('fetches parent issueId via single query then sends issueId + parentId in commentCreate', async () => {
    const requestFn = vi.fn().mockResolvedValue({ comment: { issueId: 'ISSUE-UUID-1' } });

    const replyCommentMock = {
      id: 'c2',
      body: 'reply',
      url: '',
      createdAt: new Date('2024-01-01'),
      get user() { return Promise.resolve(null); },
    };
    const payloadMock = { get comment() { return Promise.resolve(replyCommentMock); } };
    const createCommentFn = vi.fn().mockResolvedValue(payloadMock);

    stdMocks(makeClientMock({ createComment: createCommentFn }), requestFn);
    const program = await buildProgram();

    await program.parseAsync([
      'node', 'linear', 'issues', 'comment', 'reply', 'COMMENT-1', '--body', 'reply', '--json',
    ]);

    // requestFn called with the typed document and parentId variable
    expect(requestFn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ id: 'COMMENT-1' })
    );
    // Then: create comment with both issueId and parentId
    expect(createCommentFn).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: 'ISSUE-UUID-1', parentId: 'COMMENT-1' })
    );
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
    const commentMock = {
      id: 'COMMENT-1',
      body: 'edited',
      url: '',
      createdAt: new Date('2024-01-01'),
      get user() { return Promise.resolve(null); },
    };
    const payloadMock = { get comment() { return Promise.resolve(commentMock); } };
    const updateCommentFn = vi.fn().mockResolvedValue(payloadMock);
    stdMocks(makeClientMock({ updateComment: updateCommentFn }));
    const program = await buildProgram();

    await program.parseAsync([
      'node', 'linear', 'issues', 'comment', 'update', 'COMMENT-1', '--body', 'edited', '--json',
    ]);

    expect(updateCommentFn).toHaveBeenCalledWith('COMMENT-1', expect.objectContaining({ body: 'edited' }));
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
    const deleteCommentFn = vi.fn().mockResolvedValue({ success: true });
    stdMocks(makeClientMock({ deleteComment: deleteCommentFn }));
    const program = await buildProgram();

    await program.parseAsync([
      'node', 'linear', 'issues', 'comment', 'delete', 'COMMENT-1', '--yes',
    ]);

    expect(deleteCommentFn).toHaveBeenCalledWith('COMMENT-1');
  });

  it('errors in non-TTY without --yes (does not call delete)', async () => {
    const deleteCommentFn = vi.fn();
    const exitErrorMock = vi.fn();

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok(makeClientMock({ deleteComment: deleteCommentFn }))),
      getRequestFn: vi.fn(),
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
    expect(deleteCommentFn).not.toHaveBeenCalled();
  });
});
