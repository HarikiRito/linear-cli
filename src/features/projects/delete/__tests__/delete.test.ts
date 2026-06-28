import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

// UUID bypasses resolveProject network call (looksLikeId short-circuits)
const PROJ_UUID = '11111111-1111-1111-1111-111111111111';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('deleteProject', () => {
  it('--yes calls deleteProject SDK method with resolved id', async () => {
    const deleteProjectFn = vi.fn().mockResolvedValue({});
    vi.doMock('../../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteProject: deleteProjectFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { deleteProject } = await import('../delete.js');
    await deleteProject({ id: PROJ_UUID, yes: true });

    expect(deleteProjectFn).toHaveBeenCalledWith(PROJ_UUID);
  });

  it('non-TTY without --yes calls exitError, does not call deleteProject', async () => {
    const deleteProjectFn = vi.fn();
    const exitErrorMock = vi.fn();
    vi.doMock('../../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteProject: deleteProjectFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../../lib/runner.js', () => ({ exitError: exitErrorMock }));

    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    const { deleteProject } = await import('../delete.js');
    await deleteProject({ id: PROJ_UUID, yes: false });

    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

    expect(exitErrorMock).toHaveBeenCalled();
    const errArg = exitErrorMock.mock.calls[0][0] as Error;
    expect(errArg.message).toMatch(/--yes.*non-interactively/i);
    expect(deleteProjectFn).not.toHaveBeenCalled();
  });

  it('unknown project name calls exitError via resolveProject, does not call deleteProject', async () => {
    const deleteProjectFn = vi.fn();
    const exitErrorMock = vi.fn();
    vi.doMock('../../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(
        ok({
          deleteProject: deleteProjectFn,
          projects: vi.fn().mockResolvedValue({ nodes: [] }),
        })
      ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../../lib/runner.js', () => ({ exitError: exitErrorMock }));

    const { deleteProject } = await import('../delete.js');
    await deleteProject({ id: 'nonexistent-project-name', yes: true });

    expect(exitErrorMock).toHaveBeenCalled();
    expect(deleteProjectFn).not.toHaveBeenCalled();
  });

  it('SDK error propagates via exitError', async () => {
    const exitErrorMock = vi.fn();
    vi.doMock('../../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(
        ok({
          deleteProject: vi.fn().mockRejectedValue(new Error('API error')),
        })
      ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../../lib/runner.js', () => ({ exitError: exitErrorMock }));

    const { deleteProject } = await import('../delete.js');
    await deleteProject({ id: PROJ_UUID, yes: true });

    expect(exitErrorMock).toHaveBeenCalled();
  });
});
