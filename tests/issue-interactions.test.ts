import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClientMock(overrides: Record<string, unknown>) {
  return overrides;
}

function stdMocks(clientMock: ReturnType<typeof makeClientMock>, requestFn?: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok(clientMock)),
    getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
    getRequestFn: vi.fn().mockReturnValue(requestFn ?? vi.fn()),
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
// issues mark
// ---------------------------------------------------------------------------
describe('issues mark (integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('mark related-to calls createIssueRelation with type=related', async () => {
    const createIssueRelationFn = vi.fn().mockResolvedValue({ success: true });
    const clientMock = makeClientMock({ createIssueRelation: createIssueRelationFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'mark', 'related-to', 'ENG-1', 'ENG-2']);

    expect(createIssueRelationFn).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: 'ENG-1', relatedIssueId: 'ENG-2', type: 'related' })
    );
  });

  it('mark with invalid relation calls exitError without SDK call', async () => {
    const createIssueRelationFn = vi.fn();
    const exitErrorMock = vi.fn();
    const clientMock = makeClientMock({ createIssueRelation: createIssueRelationFn });
    vi.doMock('../src/lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'mark', 'invalid-relation', 'ENG-1', 'ENG-2']);

    expect(exitErrorMock).toHaveBeenCalled();
    expect(createIssueRelationFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// issues relations
// ---------------------------------------------------------------------------
describe('issues relations (integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('lists relations from API response', async () => {
    const requestFn = vi.fn().mockResolvedValue({
      issue: {
        id: 'issue-uuid',
        identifier: 'ENG-1',
        parent: null,
        children: { nodes: [] },
        relations: {
          nodes: [
            {
              id: 'rel-id-1',
              type: 'blocks',
              relatedIssue: { id: 'other-uuid', identifier: 'ENG-2', title: 'Other Issue' },
            },
          ],
        },
        inverseRelations: { nodes: [] },
      },
    });

    const capturedRows: string[][] = [];
    const clientMock = makeClientMock({});
    vi.doMock('../src/lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows.push(...rows);
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'relations', 'ENG-1']);

    const flat = capturedRows.flat();
    expect(flat).toContain('rel-id-1');
    expect(flat).toContain('ENG-2');
    expect(flat).toContain('Other Issue');
  });
});

// ---------------------------------------------------------------------------
// issues link
// ---------------------------------------------------------------------------
describe('issues link (integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls attachmentLinkURL with issue ID and URL', async () => {
    const payloadMock = { get attachment() { return Promise.resolve({ id: 'att-uuid' }); } };
    const attachmentLinkURLFn = vi.fn().mockResolvedValue(payloadMock);
    const clientMock = makeClientMock({ attachmentLinkURL: attachmentLinkURLFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'link', 'ENG-1', 'https://example.com']);

    expect(attachmentLinkURLFn).toHaveBeenCalledWith('ENG-1', 'https://example.com', undefined);
  });
});

// ---------------------------------------------------------------------------
// issues favorite / unfavorite
// ---------------------------------------------------------------------------
describe('issues favorite (integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('favorite calls createFavorite with issueId', async () => {
    const createFavoriteFn = vi.fn().mockResolvedValue({ success: true });
    const clientMock = makeClientMock({ createFavorite: createFavoriteFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'favorite', 'ENG-1']);

    expect(createFavoriteFn).toHaveBeenCalledWith({ issueId: 'ENG-1' });
  });

  it('unfavorite with matching favorite calls deleteFavorite', async () => {
    const deleteFavoriteFn = vi.fn().mockResolvedValue({ success: true });
    const requestFn = vi.fn().mockResolvedValue({
      favorites: {
        nodes: [{ id: 'fav-uuid', type: 'issue', issue: { id: 'issue-uuid', identifier: 'ENG-1' } }],
      },
    });
    const clientMock = makeClientMock({ deleteFavorite: deleteFavoriteFn });
    vi.doMock('../src/lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'unfavorite', 'ENG-1']);

    expect(deleteFavoriteFn).toHaveBeenCalledWith('fav-uuid');
  });

  it('unfavorite when not favorited exits with error', async () => {
    const exitErrorMock = vi.fn();
    const deleteFavoriteFn = vi.fn();
    const requestFn = vi.fn().mockResolvedValue({
      favorites: { nodes: [] },
    });
    const clientMock = makeClientMock({ deleteFavorite: deleteFavoriteFn });
    vi.doMock('../src/lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'unfavorite', 'ENG-99']);

    expect(exitErrorMock).toHaveBeenCalled();
    expect(deleteFavoriteFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// issues remind
// ---------------------------------------------------------------------------
describe('issues remind (integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls issueReminder with correct DateTime for ISO input', async () => {
    const issueReminderFn = vi.fn().mockResolvedValue({ success: true });
    const clientMock = makeClientMock({ issueReminder: issueReminderFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'remind', 'ENG-1', '2026-07-01T09:00:00']);

    expect(issueReminderFn).toHaveBeenCalledWith('ENG-1', expect.any(Date));
    const date = issueReminderFn.mock.calls[0][1] as Date;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6); // July
    expect(date.getDate()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// issues copy
// ---------------------------------------------------------------------------
describe('issues copy (integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('--url prints only the URL', async () => {
    const requestFn = vi.fn().mockResolvedValue({
      issue: {
        id: 'uuid-1',
        identifier: 'ENG-42',
        url: 'https://linear.app/test/ENG-42',
        branchName: 'eng-42-branch',
      },
    });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const clientMock = makeClientMock({});
    vi.doMock('../src/lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'copy', 'ENG-42', '--url']);

    expect(consoleSpy).toHaveBeenCalledWith('https://linear.app/test/ENG-42');
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// issues history
// ---------------------------------------------------------------------------
describe('issues history (integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('renders history events table and description caveat', async () => {
    const requestFn = vi.fn().mockResolvedValue({
      issue: {
        id: 'issue-uuid',
        identifier: 'ENG-1',
        history: {
          nodes: [
            {
              id: 'h-1',
              createdAt: '2026-06-01T10:00:00.000Z',
              actors: [{ id: 'u', name: 'Alice', displayName: 'Alice A.' }],
              updatedDescription: true,
              fromTitle: null,
              toTitle: null,
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
    });

    const capturedRows: string[][] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const clientMock = makeClientMock({});
    vi.doMock('../src/lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows.push(...rows);
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'history', 'ENG-1']);

    // Caveat must be printed
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('description text is NOT available');

    // History rows should contain actor and change
    const flat = capturedRows.flat();
    expect(flat.some((v) => v.includes('Alice'))).toBe(true);
    expect(flat.some((v) => v.includes('description changed'))).toBe(true);

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// issues update --no-parent (integration)
// ---------------------------------------------------------------------------
describe('issues update --no-parent (integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls updateIssue with parentId=null', async () => {
    function makePayloadMock() {
      const stateMock = { name: 'Todo' };
      const issueMock = {
        id: 'uuid-1',
        identifier: 'ENG-1',
        title: 'Test',
        url: 'https://linear.app/ENG-1',
        get state() { return Promise.resolve(stateMock); },
      };
      return { get issue() { return Promise.resolve(issueMock); } };
    }

    const updateIssueFn = vi.fn().mockResolvedValue(makePayloadMock());
    const clientMock = makeClientMock({ updateIssue: updateIssueFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'update', 'ENG-1', '--no-parent']);

    expect(updateIssueFn).toHaveBeenCalledWith(
      'ENG-1',
      expect.objectContaining({ parentId: null })
    );
  });
});
