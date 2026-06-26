import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeBranchResponse(branchName = 'eng-123-fix-thing') {
  return {
    issue: {
      id: 'issue-uuid',
      branchName,
    },
  };
}

function stdMocks(requestFn: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({})),
    getRequestFn: vi.fn().mockReturnValue(requestFn),
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

describe('issues branch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
    delete process.env.LINEAR_TEAM_ID;
  });

  it('prints branchName to stdout', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeBranchResponse());
    stdMocks(requestFn);

    vi.doMock('../src/features/issues/shared/resolve.js', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('../src/features/issues/shared/resolve.js')>();
      return {
        ...actual,
        resolveIssueIdentifier: vi.fn().mockResolvedValue(ok('ENG-123')),
      };
    });

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'branch', 'ENG-123']);

    expect(stdoutSpy).toHaveBeenCalledWith('eng-123-fix-thing\n');
  });


  it('--checkout runs git checkout -b', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeBranchResponse());
    stdMocks(requestFn);
    vi.doMock('../src/features/issues/shared/resolve.js', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('../src/features/issues/shared/resolve.js')>();
      return {
        ...actual,
        resolveIssueIdentifier: vi.fn().mockResolvedValue(ok('ENG-123')),
      };
    });

    const execFileSync = vi.fn();
    vi.doMock('node:child_process', () => ({ execFileSync }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'branch', 'ENG-123', '--checkout']);

    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['checkout', '-b', 'eng-123-fix-thing'],
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('--checkout errors cleanly when git fails', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeBranchResponse());
    const exitErrorMock = vi.fn();

    stdMocks(requestFn);
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));
    vi.doMock('../src/features/issues/shared/resolve.js', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('../src/features/issues/shared/resolve.js')>();
      return {
        ...actual,
        resolveIssueIdentifier: vi.fn().mockResolvedValue(ok('ENG-123')),
      };
    });
    vi.doMock('node:child_process', () => ({
      execFileSync: vi.fn().mockImplementation(() => {
        throw new Error('not a git repo');
      }),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'branch', 'ENG-123', '--checkout']);

    expect(exitErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ValidationError' })
    );
  });

  it('bare number "123" expands to team key via resolveIssueIdentifier', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeBranchResponse('eng-123-fix-thing'));

    const teamMock = vi.fn().mockResolvedValue({ key: 'ENG' });
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ team: teamMock })),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    // Use the real resolve module (don't let stale doMock from previous tests override it)
    vi.doMock('../src/features/issues/shared/resolve.js', async (importOriginal) => {
      return importOriginal<typeof import('../src/features/issues/shared/resolve.js')>();
    });

    process.env.LINEAR_TEAM_ID = 'team-uuid-eng';

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'branch', '123']);

    expect(teamMock).toHaveBeenCalledWith('team-uuid-eng');
    expect(requestFn).toHaveBeenCalledWith(expect.anything(), { id: 'ENG-123' });
    expect(stdoutSpy).toHaveBeenCalledWith('eng-123-fix-thing\n');
  });
});
