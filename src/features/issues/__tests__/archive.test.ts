import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('archiveIssue', () => {
  it('calls archiveIssue SDK method with resolved ID', async () => {
    const archiveIssueFn = vi.fn().mockResolvedValue({ success: true });
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ archiveIssue: archiveIssueFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { archiveIssue } = await import('../archive/archive.js');
    await archiveIssue({ issue: 'ENG-1' });

    expect(archiveIssueFn).toHaveBeenCalledWith('ENG-1');
  });

  it('SDK error propagates as exit error', async () => {
    const exitErrorMock = vi.fn();
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({
        archiveIssue: vi.fn().mockRejectedValue(new Error('API error')),
      })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorMock }));

    const { archiveIssue } = await import('../archive/archive.js');
    await archiveIssue({ issue: 'ENG-1' });

    expect(exitErrorMock).toHaveBeenCalled();
  });
});

describe('unarchiveIssue', () => {
  it('calls unarchiveIssue SDK method with resolved ID', async () => {
    const unarchiveIssueFn = vi.fn().mockResolvedValue({ success: true });
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ unarchiveIssue: unarchiveIssueFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { unarchiveIssue } = await import('../archive/archive.js');
    await unarchiveIssue({ issue: 'ENG-1' });

    expect(unarchiveIssueFn).toHaveBeenCalledWith('ENG-1');
  });
});
