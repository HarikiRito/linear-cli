import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('parseWhen', () => {
  it('parses ISO datetime', async () => {
    const { parseWhen } = await import('../remind/remind.js');
    const d = parseWhen('2026-07-01T09:00:00');
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6); // July (0-indexed)
    expect(d?.getDate()).toBe(1);
  });

  it('parses date-only as midnight UTC', async () => {
    const { parseWhen } = await import('../remind/remind.js');
    const d = parseWhen('2026-07-01');
    expect(d).not.toBeNull();
    expect(d?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('parses "tomorrow" as next calendar day at midnight', async () => {
    const { parseWhen } = await import('../remind/remind.js');
    const d = parseWhen('tomorrow');
    expect(d).not.toBeNull();
    const expected = new Date();
    expected.setDate(expected.getDate() + 1);
    expect(d?.getDate()).toBe(expected.getDate());
    expect(d?.getHours()).toBe(0);
    expect(d?.getMinutes()).toBe(0);
  });

  it('parses "tomorrow 09:00" as 09:00 next day local time', async () => {
    const { parseWhen } = await import('../remind/remind.js');
    const d = parseWhen('tomorrow 09:00');
    expect(d).not.toBeNull();
    expect(d?.getHours()).toBe(9);
    expect(d?.getMinutes()).toBe(0);
  });

  it('returns null for unrecognized format', async () => {
    const { parseWhen } = await import('../remind/remind.js');
    expect(parseWhen('next week')).toBeNull();
    expect(parseWhen('in 3 days')).toBeNull();
  });
});

describe('remindIssue', () => {
  it('calls issueReminder with resolved issue ID and parsed Date', async () => {
    const issueReminderFn = vi.fn().mockResolvedValue({ success: true });
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ issueReminder: issueReminderFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { remindIssue } = await import('../remind/remind.js');
    await remindIssue({ issue: 'ENG-1', when: '2026-07-01T09:00:00' });

    expect(issueReminderFn).toHaveBeenCalledWith('ENG-1', expect.any(Date));
    const date = issueReminderFn.mock.calls[0][1] as Date;
    expect(date.getFullYear()).toBe(2026);
  });

  it('exits with ValidationError for unrecognized when format, no SDK call', async () => {
    const exitErrorMock = vi.fn();
    const issueReminderFn = vi.fn();
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ issueReminder: issueReminderFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorMock }));

    const { remindIssue } = await import('../remind/remind.js');
    await remindIssue({ issue: 'ENG-1', when: 'next week' });

    expect(exitErrorMock).toHaveBeenCalled();
    const err = exitErrorMock.mock.calls[0][0] as { kind: string };
    expect(err.kind).toBe('ValidationError');
    expect(issueReminderFn).not.toHaveBeenCalled();
  });

  it('date-only 2026-07-01 calls issueReminder with midnight UTC Date', async () => {
    const issueReminderFn = vi.fn().mockResolvedValue({ success: true });
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ issueReminder: issueReminderFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { remindIssue } = await import('../remind/remind.js');
    await remindIssue({ issue: 'ENG-1', when: '2026-07-01' });

    expect(issueReminderFn).toHaveBeenCalledWith('ENG-1', expect.any(Date));
    const date = issueReminderFn.mock.calls[0][1] as Date;
    expect(date.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});
