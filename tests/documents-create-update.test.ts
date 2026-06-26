import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeDocumentMock(title = 'Test Doc', content: string | null = null) {
  return {
    id: 'doc-uuid',
    title,
    slugId: 'test-doc-abc',
    content,
    updatedAt: '2026-01-01T00:00:00.000Z',
    get project() {
      return Promise.resolve({ id: 'proj-uuid', name: 'My Project' });
    },
  };
}

function makeDocumentPayloadMock(docMock = makeDocumentMock()) {
  return {
    get document() {
      return Promise.resolve(docMock);
    },
  };
}

function makeClientMock(overrides: Record<string, unknown>) {
  return overrides;
}

function stdMocks(clientMock: ReturnType<typeof makeClientMock>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok(clientMock)),
    getRequestFn: vi.fn(),
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

// Project UUID: bypasses resolveProject name-lookup (looksLikeId short-circuits)
const PROJ_UUID = '11111111-1111-1111-1111-111111111111';

describe('documents create', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls createDocument with title and projectId', async () => {
    const createDocumentFn = vi.fn().mockResolvedValue(makeDocumentPayloadMock());
    const clientMock = makeClientMock({ createDocument: createDocumentFn });
    stdMocks(clientMock);
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

    expect(createDocumentFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Doc', projectId: PROJ_UUID })
    );
  });

  it('--content is passed inline to mutation', async () => {
    const createDocumentFn = vi
      .fn()
      .mockResolvedValue(makeDocumentPayloadMock(makeDocumentMock('T', 'hello world')));
    const clientMock = makeClientMock({ createDocument: createDocumentFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'documents',
      'create',
      '--title',
      'T',
      '--project',
      PROJ_UUID,
      '--content',
      'hello world',
    ]);

    expect(createDocumentFn).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'hello world' })
    );
  });

  it('missing --title causes Commander error', async () => {
    const clientMock = makeClientMock({});
    stdMocks(clientMock);
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'documents', 'create', '--project', PROJ_UUID])
    ).rejects.toThrow();
  });

  it('creates standalone doc without --project (no projectId in mutation)', async () => {
    const createDocumentFn = vi.fn().mockResolvedValue(
      makeDocumentPayloadMock({
        ...makeDocumentMock('Standalone'),
        get project() {
          return Promise.resolve(null);
        },
      })
    );
    const clientMock = makeClientMock({ createDocument: createDocumentFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'documents',
      'create',
      '--title',
      'Standalone',
    ]);

    expect(createDocumentFn).toHaveBeenCalledOnce();
    const callArg = createDocumentFn.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg).toMatchObject({ title: 'Standalone' });
    expect(callArg).not.toHaveProperty('projectId');
  });
});

describe('documents update', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls updateDocument with only provided fields (title only)', async () => {
    const updateDocumentFn = vi
      .fn()
      .mockResolvedValue(makeDocumentPayloadMock(makeDocumentMock('New Title')));
    const clientMock = makeClientMock({ updateDocument: updateDocumentFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'documents',
      'update',
      'doc-uuid',
      '--title',
      'New Title',
    ]);

    expect(updateDocumentFn).toHaveBeenCalledWith('doc-uuid', { title: 'New Title' });
  });

  it('--content updates content field in patch', async () => {
    const updateDocumentFn = vi
      .fn()
      .mockResolvedValue(makeDocumentPayloadMock(makeDocumentMock('T', 'newbody')));
    const clientMock = makeClientMock({ updateDocument: updateDocumentFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'documents',
      'update',
      'doc-uuid',
      '--content',
      'newbody',
    ]);

    const callInput = updateDocumentFn.mock.calls[0][1];
    expect(callInput).toEqual({ content: 'newbody' });
  });
});
