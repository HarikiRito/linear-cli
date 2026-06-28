import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeCopyResponse() {
  return {
    issue: {
      id: 'uuid-1',
      identifier: 'ENG-42',
      url: 'https://linear.app/test/issue/ENG-42',
      branchName: 'eng-42-test-issue',
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('copyIssue', () => {
  it('no flag: prints identifier, url, and branch name labeled', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeCopyResponse());
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { copyIssue } = await import('../copy/copy.js');
    await copyIssue({ id: 'ENG-42' });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('identifier: ENG-42');
    expect(output).toContain('url: https://linear.app/test/issue/ENG-42');
    expect(output).toContain('branch: eng-42-test-issue');
    consoleSpy.mockRestore();
  });

  it('--url: prints only the URL value unlabeled', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeCopyResponse());
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { copyIssue } = await import('../copy/copy.js');
    await copyIssue({ id: 'ENG-42', url: true });

    expect(consoleSpy).toHaveBeenCalledWith('https://linear.app/test/issue/ENG-42');
    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).not.toContain('identifier:');
    expect(allOutput).not.toContain('branch:');
    consoleSpy.mockRestore();
  });

  it('--id: prints only the identifier unlabeled', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeCopyResponse());
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { copyIssue } = await import('../copy/copy.js');
    await copyIssue({ id: 'ENG-42', identifier: true });

    expect(consoleSpy).toHaveBeenCalledWith('ENG-42');
    consoleSpy.mockRestore();
  });

  it('--branch: prints only the branchName unlabeled', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeCopyResponse());
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { copyIssue } = await import('../copy/copy.js');
    await copyIssue({ id: 'ENG-42', branch: true });

    expect(consoleSpy).toHaveBeenCalledWith('eng-42-test-issue');
    consoleSpy.mockRestore();
  });
});
