import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

const DOC_ID = 'doc-uuid-for-delete';

function stdMocksWithClient(clientOverrides: Record<string, unknown>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok(clientOverrides)),
    getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientOverrides)),
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

// ---------------------------------------------------------------------------
// documents delete (integration via buildProgram)
// ---------------------------------------------------------------------------
describe('documents delete (integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('--yes calls deleteDocument with id and exits 0', async () => {
    const deleteDocumentFn = vi.fn().mockResolvedValue({});
    stdMocksWithClient({ deleteDocument: deleteDocumentFn });
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'documents', 'delete', DOC_ID, '--yes']);

    expect(deleteDocumentFn).toHaveBeenCalledWith(DOC_ID);
    expect(process.exitCode).toBeUndefined();
  });

  it('non-TTY without --yes calls exitError and does not call deleteDocument', async () => {
    const deleteDocumentFn = vi.fn();
    const exitErrorMock = vi.fn();
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ deleteDocument: deleteDocumentFn })),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteDocument: deleteDocumentFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'documents', 'delete', DOC_ID]);

    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

    expect(exitErrorMock).toHaveBeenCalled();
    const errArg = exitErrorMock.mock.calls[0][0] as Error;
    expect(errArg.message).toMatch(/--yes.*non-interactively/i);
    expect(deleteDocumentFn).not.toHaveBeenCalled();
  });

  it('SDK error propagates via exitError', async () => {
    const exitErrorMock = vi.fn();
    const deleteDocumentFn = vi.fn().mockRejectedValue(new Error('API error'));
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ deleteDocument: deleteDocumentFn })),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteDocument: deleteDocumentFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'documents', 'delete', DOC_ID, '--yes']);

    expect(exitErrorMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// documents delete (unit — deleteDocument function directly)
// ---------------------------------------------------------------------------
describe('documents delete (unit)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls deleteDocument SDK method with given id', async () => {
    const deleteDocumentFn = vi.fn().mockResolvedValue({});
    vi.doMock('../src/lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteDocument: deleteDocumentFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const { deleteDocument } = await import('../src/features/documents/delete.js');
    await deleteDocument({ id: DOC_ID, yes: true });

    expect(deleteDocumentFn).toHaveBeenCalledWith(DOC_ID);
  });

  it('SDK error propagates as exit error (unit)', async () => {
    const exitErrorMock = vi.fn();
    vi.doMock('../src/lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(
        ok({
          deleteDocument: vi.fn().mockRejectedValue(new Error('SDK error')),
        })
      ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const { deleteDocument } = await import('../src/features/documents/delete.js');
    await deleteDocument({ id: DOC_ID, yes: true });

    expect(exitErrorMock).toHaveBeenCalled();
  });
});
