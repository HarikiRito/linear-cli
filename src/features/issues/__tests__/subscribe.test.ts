import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('subscribeToIssue', () => {
  it('calls issueSubscribe with resolved issue ID', async () => {
    const issueSubscribeFn = vi.fn().mockResolvedValue({ success: true });
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ issueSubscribe: issueSubscribeFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { subscribeToIssue } = await import('../subscribe/subscribe.js');
    await subscribeToIssue({ issue: 'ENG-1' });

    expect(issueSubscribeFn).toHaveBeenCalledWith('ENG-1');
  });

  it('SDK error propagates as exit error', async () => {
    const exitErrorMock = vi.fn();
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({
        issueSubscribe: vi.fn().mockRejectedValue(new Error('API error')),
      })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorMock }));

    const { subscribeToIssue } = await import('../subscribe/subscribe.js');
    await subscribeToIssue({ issue: 'ENG-1' });

    expect(exitErrorMock).toHaveBeenCalled();
  });
});

describe('unsubscribeFromIssue', () => {
  it('calls issueUnsubscribe with resolved issue ID', async () => {
    const issueUnsubscribeFn = vi.fn().mockResolvedValue({ success: true });
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ issueUnsubscribe: issueUnsubscribeFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { unsubscribeFromIssue } = await import('../subscribe/subscribe.js');
    await unsubscribeFromIssue({ issue: 'ENG-1' });

    expect(issueUnsubscribeFn).toHaveBeenCalledWith('ENG-1');
  });
});
