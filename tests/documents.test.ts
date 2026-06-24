import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Project UUID: bypasses resolveProject network call (looksLikeId short-circuits)
const PROJ_UUID = '11111111-1111-1111-1111-111111111111';

function makeDocumentListNode(
  overrides: Partial<{
    id: string;
    title: string;
    slugId: string;
    updatedAt: string;
    project: { id: string; name: string } | null;
  }> = {}
) {
  return {
    id: 'doc-uuid',
    title: 'Test Doc',
    slugId: 'test-doc-abc',
    updatedAt: '2026-01-01T00:00:00.000Z',
    project: null,
    ...overrides,
  };
}

function makeDocumentsResponse(
  nodes: ReturnType<typeof makeDocumentListNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { documents: { nodes, pageInfo } };
}

function makeDocumentDetailResponse(overrides: Record<string, unknown> = {}) {
  return {
    document: {
      id: 'doc-uuid',
      title: 'Test Doc',
      slugId: 'test-doc-abc',
      content: '# Hello\n\nContent here.',
      updatedAt: '2026-01-01T00:00:00.000Z',
      project: { id: PROJ_UUID, name: 'My Project' },
      creator: { id: 'user-uuid', name: 'Alice', displayName: 'Alice A.' },
      ...overrides,
    },
  };
}

function makeCreateDocumentPayload(
  overrides: Partial<{
    id: string;
    title: string;
    slugId: string;
    content: string | null;
    project: { id: string; name: string } | null;
    updatedAt: string;
  }> = {}
) {
  const doc = {
    id: 'doc-new',
    title: 'New Doc',
    slugId: 'new-doc-xyz',
    content: null,
    updatedAt: '2026-06-01T00:00:00.000Z',
    get project() {
      return Promise.resolve(
        overrides.project !== undefined ? overrides.project : { id: PROJ_UUID, name: 'My Project' }
      );
    },
    ...overrides,
  };
  return {
    get document() {
      return Promise.resolve(doc);
    },
  };
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
  const { registerDocuments } = await import('../src/features/documents/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerDocuments(program);
  return program;
}

// ---------------------------------------------------------------------------
// documents list
// ---------------------------------------------------------------------------
describe('documents list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('JSON has documents array and pageInfo', async () => {
    const nodes = [
      makeDocumentListNode(),
      makeDocumentListNode({ id: 'doc-2', title: 'Second Doc', slugId: 'second-doc-def' }),
    ];
    const requestFn = vi.fn().mockResolvedValue(makeDocumentsResponse(nodes));
    const printJsonCalls: unknown[] = [];

    stdMocks(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'documents', 'list', '--json']);

    expect(requestFn).toHaveBeenCalledOnce();
    const out = printJsonCalls[0] as {
      documents: { id: string; title: string; slugId: string; updatedAt: string }[];
      pageInfo: { hasNextPage: boolean };
    };
    expect(Array.isArray(out.documents)).toBe(true);
    expect(out.documents.length).toBe(2);
    expect(out.documents[0]).toMatchObject({
      id: 'doc-uuid',
      title: 'Test Doc',
      slugId: 'test-doc-abc',
    });
    expect(out.pageInfo).toBeDefined();
  });

  it('--project scopes filter to project id', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeDocumentsResponse([]));
    stdMocks(requestFn);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'documents',
      'list',
      '--project',
      PROJ_UUID,
      '--json',
    ]);

    const [, vars] = requestFn.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(JSON.stringify(vars)).toContain(PROJ_UUID);
  });

  it('empty result exits 0 with empty array', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeDocumentsResponse([]));
    const printJsonCalls: unknown[] = [];

    stdMocks(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'documents', 'list', '--json']);

    const out = printJsonCalls[0] as { documents: unknown[] };
    expect(out.documents).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// documents get
// ---------------------------------------------------------------------------
describe('documents get', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('JSON has full document fields', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeDocumentDetailResponse());
    const printJsonCalls: unknown[] = [];

    stdMocks(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'documents', 'get', 'doc-uuid', '--json']);

    const out = printJsonCalls[0] as { document: Record<string, unknown> };
    expect(out.document).toMatchObject({
      id: 'doc-uuid',
      title: 'Test Doc',
      slugId: 'test-doc-abc',
    });
    expect('content' in out.document).toBe(true);
    expect('updatedAt' in out.document).toBe(true);
    expect(out.document.project).toMatchObject({ id: PROJ_UUID });
    expect(out.document.creator).toMatchObject({ id: 'user-uuid' });
  });

  it('unknown ID calls exitError', async () => {
    const requestFn = vi.fn().mockResolvedValue({ document: null });
    const exitErrorMock = vi.fn();

    stdMocks(requestFn);
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'documents', 'get', 'bad-id', '--json']);

    expect(exitErrorMock).toHaveBeenCalled();
  });

  it('content field is present in --json output (not contentState)', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeDocumentDetailResponse());
    const printJsonCalls: unknown[] = [];

    stdMocks(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'documents', 'get', 'doc-uuid', '--json']);

    const out = printJsonCalls[0] as { document: Record<string, unknown> };
    expect('content' in out.document).toBe(true);
    expect('contentState' in out.document).toBe(false);
    expect(out.document.content).toBe('# Hello\n\nContent here.');
  });
});

// ---------------------------------------------------------------------------
// documents create
// ---------------------------------------------------------------------------
describe('documents create', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('creates standalone doc without --project (no projectId in mutation)', async () => {
    const createFn = vi.fn().mockResolvedValue(makeCreateDocumentPayload({ project: null }));
    const printJsonCalls: unknown[] = [];

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ createDocument: createFn })),
      getRequestFn: vi.fn(),
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
      'documents',
      'create',
      '--title',
      'My Doc',
      '--json',
    ]);

    expect(createFn).toHaveBeenCalledOnce();
    const input = createFn.mock.calls[0][0] as Record<string, unknown>;
    expect(input).toMatchObject({ title: 'My Doc' });
    expect(input).not.toHaveProperty('projectId');

    const out = printJsonCalls[0] as { document: { id: string; project: null } };
    expect(out.document.id).toBe('doc-new');
    expect(out.document.project).toBeNull();
  });

  it('creates doc with --project resolved by UUID (projectId in mutation)', async () => {
    const createFn = vi.fn().mockResolvedValue(makeCreateDocumentPayload());
    const printJsonCalls: unknown[] = [];

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ createDocument: createFn })),
      getRequestFn: vi.fn(),
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
      'documents',
      'create',
      '--title',
      'My Doc',
      '--project',
      PROJ_UUID,
      '--json',
    ]);

    expect(createFn).toHaveBeenCalledOnce();
    const input = createFn.mock.calls[0][0] as Record<string, unknown>;
    expect(input).toMatchObject({ title: 'My Doc', projectId: PROJ_UUID });
  });

  it('missing --title causes Commander error', async () => {
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await expect(
      program.parseAsync(['node', 'linear', 'documents', 'create', '--project', PROJ_UUID])
    ).rejects.toThrow();
  });
});
