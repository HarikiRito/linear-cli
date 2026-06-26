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
    ]);

    const [, vars] = requestFn.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(JSON.stringify(vars)).toContain(PROJ_UUID);
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


  it('unknown ID calls exitError', async () => {
    const requestFn = vi.fn().mockResolvedValue({ document: null });
    const exitErrorMock = vi.fn();

    stdMocks(requestFn);
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'documents', 'get', 'bad-id']);

    expect(exitErrorMock).toHaveBeenCalled();
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

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ createDocument: createFn })),
      getRequestFn: vi.fn(),
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
    ]);

    expect(createFn).toHaveBeenCalledOnce();
    const input = createFn.mock.calls[0][0] as Record<string, unknown>;
    expect(input).toMatchObject({ title: 'My Doc' });
    expect(input).not.toHaveProperty('projectId');
  });

  it('creates doc with --project resolved by UUID (projectId in mutation)', async () => {
    const createFn = vi.fn().mockResolvedValue(makeCreateDocumentPayload());

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ createDocument: createFn })),
      getRequestFn: vi.fn(),
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
