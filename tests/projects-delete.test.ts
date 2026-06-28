import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

// UUID that short-circuits resolveProject (looksLikeId returns true)
const PROJ_UUID = '11111111-1111-1111-1111-111111111111';

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
  const { registerProjects } = await import('../src/features/projects/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerProjects(program);
  return program;
}

// ---------------------------------------------------------------------------
// projects delete (integration via buildProgram)
// ---------------------------------------------------------------------------
describe('projects delete (integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('--yes calls deleteProject with resolved id and exits 0', async () => {
    const deleteProjectFn = vi.fn().mockResolvedValue({});
    stdMocksWithClient({ deleteProject: deleteProjectFn });
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'projects', 'delete', PROJ_UUID, '--yes']);

    expect(deleteProjectFn).toHaveBeenCalledWith(PROJ_UUID);
    expect(process.exitCode).toBeUndefined();
  });

  it('non-TTY without --yes calls exitError and does not call deleteProject', async () => {
    const deleteProjectFn = vi.fn();
    const exitErrorMock = vi.fn();
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ deleteProject: deleteProjectFn })),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteProject: deleteProjectFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'projects', 'delete', PROJ_UUID]);

    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

    expect(exitErrorMock).toHaveBeenCalled();
    const errArg = exitErrorMock.mock.calls[0][0] as Error;
    expect(errArg.message).toMatch(/--yes.*non-interactively/i);
    expect(deleteProjectFn).not.toHaveBeenCalled();
  });

  it('SDK error propagates via exitError', async () => {
    const exitErrorMock = vi.fn();
    const deleteProjectFn = vi.fn().mockRejectedValue(new Error('API error'));
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ deleteProject: deleteProjectFn })),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteProject: deleteProjectFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'projects', 'delete', PROJ_UUID, '--yes']);

    expect(exitErrorMock).toHaveBeenCalled();
  });

  it('unknown project name calls exitError via resolveProject (no SDK delete call)', async () => {
    const exitErrorMock = vi.fn();
    const deleteProjectFn = vi.fn();
    // projects() returns empty nodes — resolveProject will fail with NotFoundError
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(
        ok({
          deleteProject: deleteProjectFn,
          projects: vi.fn().mockResolvedValue({ nodes: [] }),
        })
      ),
      getClientWithAuthRetry: vi.fn().mockReturnValue(
        ok({
          deleteProject: deleteProjectFn,
          projects: vi.fn().mockResolvedValue({ nodes: [] }),
        })
      ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync([
      'node',
      'linear',
      'projects',
      'delete',
      'nonexistent-project-name',
      '--yes',
    ]);

    expect(exitErrorMock).toHaveBeenCalled();
    expect(deleteProjectFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// projects delete (unit — deleteProject function directly)
// ---------------------------------------------------------------------------
describe('projects delete (unit)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls deleteProject SDK method with resolved id', async () => {
    const deleteProjectFn = vi.fn().mockResolvedValue({});
    vi.doMock('../src/lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteProject: deleteProjectFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const { deleteProject } = await import('../src/features/projects/delete/delete.js');
    await deleteProject({ id: PROJ_UUID, yes: true });

    expect(deleteProjectFn).toHaveBeenCalledWith(PROJ_UUID);
  });

  it('SDK error propagates as exit error (unit)', async () => {
    const exitErrorMock = vi.fn();
    vi.doMock('../src/lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(
        ok({
          deleteProject: vi.fn().mockRejectedValue(new Error('SDK error')),
        })
      ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const { deleteProject } = await import('../src/features/projects/delete/delete.js');
    await deleteProject({ id: PROJ_UUID, yes: true });

    expect(exitErrorMock).toHaveBeenCalled();
  });
});
