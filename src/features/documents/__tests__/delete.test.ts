import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

const DOC_ID = 'doc-uuid-for-delete';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('deleteDocument', () => {
  it('--yes calls deleteDocument SDK method with given id', async () => {
    const deleteDocumentFn = vi.fn().mockResolvedValue({});
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteDocument: deleteDocumentFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { deleteDocument } = await import('../delete.js');
    await deleteDocument({ id: DOC_ID, yes: true });

    expect(deleteDocumentFn).toHaveBeenCalledWith(DOC_ID);
  });

  it('non-TTY without --yes calls exitError, does not call deleteDocument', async () => {
    const deleteDocumentFn = vi.fn();
    const exitErrorMock = vi.fn();
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteDocument: deleteDocumentFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorMock }));

    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    const { deleteDocument } = await import('../delete.js');
    await deleteDocument({ id: DOC_ID, yes: false });

    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

    expect(exitErrorMock).toHaveBeenCalled();
    const errArg = exitErrorMock.mock.calls[0][0] as Error;
    expect(errArg.message).toMatch(/--yes.*non-interactively/i);
    expect(deleteDocumentFn).not.toHaveBeenCalled();
  });

  it('SDK error propagates via exitError', async () => {
    const exitErrorMock = vi.fn();
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(
        ok({
          deleteDocument: vi.fn().mockRejectedValue(new Error('API error')),
        })
      ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorMock }));

    const { deleteDocument } = await import('../delete.js');
    await deleteDocument({ id: DOC_ID, yes: true });

    expect(exitErrorMock).toHaveBeenCalled();
  });
});
