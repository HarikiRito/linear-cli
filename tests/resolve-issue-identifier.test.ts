import { afterEach, describe, expect, it, vi } from 'vitest';

describe('resolveIssueIdentifier', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env['LINEAR_TEAM_ID'];
  });

  it('expands bare number to full identifier when default team is set', async () => {
    process.env['LINEAR_TEAM_ID'] = 'team-uuid-abc';

    const teamMock = { key: 'ENG' };
    const clientMock = {
      team: vi.fn().mockResolvedValue(teamMock),
    };

    vi.doMock('../src/lib/config-file.js', () => ({
      getGlobalConfigPath: vi.fn().mockReturnValue('/nonexistent'),
      getProjectConfigPath: vi.fn().mockReturnValue('/nonexistent'),
      readConfig: vi.fn().mockReturnValue({}),
    }));
    vi.doMock('../src/lib/scope.js', () => ({
      findProjectRoot: vi.fn().mockReturnValue(null),
    }));

    const { resolveIssueIdentifier } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveIssueIdentifier('123', clientMock as never);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('ENG-123');
    expect(clientMock.team).toHaveBeenCalledWith('team-uuid-abc');
  });

  it('throws ValidationError when no default team and bare number given', async () => {
    delete process.env['LINEAR_TEAM_ID'];

    vi.doMock('../src/lib/config-file.js', () => ({
      getGlobalConfigPath: vi.fn().mockReturnValue('/nonexistent'),
      getProjectConfigPath: vi.fn().mockReturnValue('/nonexistent'),
      readConfig: vi.fn().mockReturnValue({}),
    }));
    vi.doMock('../src/lib/scope.js', () => ({
      findProjectRoot: vi.fn().mockReturnValue(null),
    }));

    const { resolveIssueIdentifier } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveIssueIdentifier('123', {} as never);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().name).toBe('ValidationError');
    expect(result._unsafeUnwrapErr().message).toMatch(/default team/i);
  });

  it('passes through full identifier ENG-123 unchanged without API call', async () => {
    const clientMock = { team: vi.fn() };

    const { resolveIssueIdentifier } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveIssueIdentifier('ENG-123', clientMock as never);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('ENG-123');
    expect(clientMock.team).not.toHaveBeenCalled();
  });

  it('passes through UUID unchanged without API call', async () => {
    const clientMock = { team: vi.fn() };

    const { resolveIssueIdentifier } = await import('../src/features/issues/shared/resolve.js');
    const result = await resolveIssueIdentifier(
      '12345678-1234-1234-1234-123456789012',
      clientMock as never
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('12345678-1234-1234-1234-123456789012');
    expect(clientMock.team).not.toHaveBeenCalled();
  });
});
