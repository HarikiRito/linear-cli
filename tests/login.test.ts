import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for runLoginFlow — exercises the real implementation with mocked I/O and SDK.
 *
 * Login redesign (see .ai/plans/..._auth-fallback-login-redesign-backlog-fixes.md):
 * after a successful API-key or OAuth authentication, the flow fetches the user's
 * teams via client.teams() and presents them as a select list (pre-selected when
 * there is exactly one) for BOTH Global and Project scope. The old free-text
 * team-id/workspace prompts are gone entirely — no workspace value is ever written.
 */

// All mocks must be registered before the module under test is imported.
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  isCancel: vi.fn().mockReturnValue(false),
}));

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn(),
}));

vi.mock('../src/features/auth/session.js', () => ({
  writeSession: vi.fn().mockReturnValue({ isErr: () => false }),
  readSession: vi.fn().mockReturnValue(null),
  deleteSession: vi.fn().mockReturnValue({ isErr: () => false }),
  writeProjectSession: vi.fn().mockReturnValue({ isErr: () => false, isOk: () => true }),
  isApiKeySession: (s: unknown) => typeof s === 'object' && s !== null && 'apiKey' in s,
  isOAuthSession: (s: unknown) => typeof s === 'object' && s !== null && 'accessToken' in s,
  getSessionPath: () => '/tmp/test-linear-cli/auth.json',
}));

vi.mock('../src/features/auth/oauth.js', () => ({
  startOAuthFlow: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock('../src/lib/config-file.js', () => ({
  getGlobalConfigPath: vi.fn().mockReturnValue('/tmp/test-linear-cli/config.toml'),
  getProjectConfigPath: vi.fn().mockReturnValue('/tmp/test-linear-cli/.linear/config.toml'),
  readConfig: vi.fn().mockReturnValue({}),
  writeConfig: vi.fn().mockReturnValue({ isErr: () => false, isOk: () => true }),
}));

vi.mock('../src/lib/gitignore.js', () => ({
  appendAuthToGitignore: vi.fn().mockReturnValue({ isErr: () => false, isOk: () => true }),
}));

import { isCancel, select, text } from '@clack/prompts';
import { LinearClient } from '@linear/sdk';
import { runLoginFlow } from '../src/features/auth/login.js';
import { startOAuthFlow } from '../src/features/auth/oauth.js';
import {
  deleteSession,
  readSession,
  writeProjectSession,
  writeSession,
} from '../src/features/auth/session.js';
import { readConfig, writeConfig } from '../src/lib/config-file.js';

const mockSelect = vi.mocked(select);
const mockText = vi.mocked(text);
const mockIsCancel = vi.mocked(isCancel);
const mockWriteSession = vi.mocked(writeSession);
const mockWriteProjectSession = vi.mocked(writeProjectSession);
const mockReadSession = vi.mocked(readSession);
const mockDeleteSession = vi.mocked(deleteSession);
const mockStartOAuthFlow = vi.mocked(startOAuthFlow);
const mockWriteConfig = vi.mocked(writeConfig);
const mockReadConfig = vi.mocked(readConfig);
const MockLinearClient = vi.mocked(LinearClient);

/** Build a LinearClient mock exposing only `viewer` + `teams`, as used by login. */
function makeClientMock(viewer: unknown, teamsFn: ReturnType<typeof vi.fn>) {
  return {
    viewer: Promise.resolve(viewer),
    teams: teamsFn,
  } as unknown as InstanceType<typeof LinearClient>;
}

const TWO_TEAMS = [
  { id: 'team-1', key: 'ENG', name: 'Engineering' },
  { id: 'team-2', key: 'DES', name: 'Design' },
];
const ONE_TEAM = [{ id: 'team-solo', key: 'SOL', name: 'Solo Team' }];

describe('runLoginFlow — invalid API key', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT call writeSession when LinearClient.viewer rejects (invalid key)', async () => {
    mockSelect.mockResolvedValueOnce('global').mockResolvedValueOnce('apikey');
    mockText.mockResolvedValue('lin_api_bad_key');
    mockIsCancel.mockReturnValue(false);

    MockLinearClient.mockImplementation(
      () =>
        ({
          viewer: Promise.reject(new Error('Authentication failed')),
        }) as unknown as InstanceType<typeof LinearClient>
    );

    const mockProcessExit = vi
      .spyOn(process, 'exit')
      .mockImplementation((_code?: number | string | null) => {
        throw new Error(`process.exit(${String(_code)})`);
      });

    // Act: runLoginFlow will reach process.exit(1) on auth failure — we intercept it
    await expect(runLoginFlow()).rejects.toThrow('process.exit(1)');

    // Assert: writeSession must NOT have been called
    expect(mockWriteSession).not.toHaveBeenCalled();

    mockProcessExit.mockRestore();
  });

  it('does NOT call writeSession when LinearClient constructor throws (malformed key)', async () => {
    mockSelect.mockResolvedValueOnce('global').mockResolvedValueOnce('apikey');
    mockText.mockResolvedValue('not-a-valid-key');
    mockIsCancel.mockReturnValue(false);

    // Constructor itself throws
    MockLinearClient.mockImplementation(() => {
      throw new Error('Invalid API key format');
    });

    const mockProcessExit = vi
      .spyOn(process, 'exit')
      .mockImplementation((_code?: number | string | null) => {
        throw new Error(`process.exit(${String(_code)})`);
      });

    await expect(runLoginFlow()).rejects.toThrow('process.exit(1)');

    expect(mockWriteSession).not.toHaveBeenCalled();

    mockProcessExit.mockRestore();
  });

  it('DOES call writeSession when LinearClient.viewer resolves (valid key)', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: TWO_TEAMS });
    mockSelect
      .mockResolvedValueOnce('global') // scope
      .mockResolvedValueOnce('apikey') // method
      .mockResolvedValueOnce('team-1'); // team
    mockText.mockResolvedValue('lin_api_valid_key');
    mockIsCancel.mockReturnValue(false);

    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-1', name: 'Test User', email: 'test@example.com' }, teamsFn)
    );

    mockWriteSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeSession
    >);

    await runLoginFlow();

    expect(mockWriteSession).toHaveBeenCalledOnce();
    expect(mockWriteSession).toHaveBeenCalledWith({ apiKey: 'lin_api_valid_key' });
  });
});

describe('runLoginFlow — project-scope API key login', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls writeProjectSession (not writeSession) for project-scope API key login', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: TWO_TEAMS });
    // scope = 'project', method = 'apikey', valid key, team = 'team-1'
    mockSelect
      .mockResolvedValueOnce('project') // scope selection
      .mockResolvedValueOnce('apikey') // method selection
      .mockResolvedValueOnce('team-1'); // team selection
    mockText.mockResolvedValueOnce('lin_api_proj_key');
    mockIsCancel.mockReturnValue(false);

    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-2', name: 'Project User', email: 'proj@example.com' }, teamsFn)
    );

    mockWriteProjectSession.mockReturnValue({
      isErr: () => false,
      isOk: () => true,
    } as ReturnType<typeof writeProjectSession>);

    await runLoginFlow();

    // writeProjectSession should be called with the API key
    expect(mockWriteProjectSession).toHaveBeenCalledOnce();
    expect(mockWriteProjectSession).toHaveBeenCalledWith(expect.any(String), {
      apiKey: 'lin_api_proj_key',
    });

    // writeSession (global) must NOT be called
    expect(mockWriteSession).not.toHaveBeenCalled();

    // Team was fetched and written to the project config
    expect(teamsFn).toHaveBeenCalledOnce();
    expect(mockWriteConfig).toHaveBeenCalledWith(
      '/tmp/test-linear-cli/.linear/config.toml',
      expect.objectContaining({ team_id: 'team-1' })
    );
  });

  it('does NOT call writeProjectSession on global-scope API key login', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: ONE_TEAM });
    // scope = 'global', method = 'apikey', valid key
    mockSelect
      .mockResolvedValueOnce('global') // scope selection
      .mockResolvedValueOnce('apikey') // method selection
      .mockResolvedValueOnce('team-solo'); // team selection
    mockText.mockResolvedValueOnce('lin_api_global_key');
    mockIsCancel.mockReturnValue(false);

    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-3', name: 'Global User', email: 'global@example.com' }, teamsFn)
    );

    mockWriteSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeSession
    >);

    await runLoginFlow();

    expect(mockWriteSession).toHaveBeenCalledOnce();
    expect(mockWriteProjectSession).not.toHaveBeenCalled();

    // Team is written to the GLOBAL config, the same way as project scope.
    expect(mockWriteConfig).toHaveBeenCalledWith(
      '/tmp/test-linear-cli/config.toml',
      expect.objectContaining({ team_id: 'team-solo' })
    );
  });
});

describe('runLoginFlow — OAuth + project-scope login', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls writeProjectSession with OAuth session and deleteSession when scope=project and method=oauth', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: TWO_TEAMS });
    // scope = 'project', method = 'oauth', team = 'team-2'
    mockSelect
      .mockResolvedValueOnce('project') // scope selection
      .mockResolvedValueOnce('oauth') // method selection
      .mockResolvedValueOnce('team-2'); // team selection
    mockIsCancel.mockReturnValue(false);

    const oauthSession = { accessToken: 'tok_abc', refreshToken: 'ref_xyz', expiresAt: 9999999999 };

    mockStartOAuthFlow.mockResolvedValue({ isErr: () => false, isOk: () => true } as Awaited<
      ReturnType<typeof startOAuthFlow>
    >);
    mockReadSession.mockReturnValue(oauthSession);
    mockWriteProjectSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeProjectSession
    >);
    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-4', name: 'OAuth User' }, teamsFn)
    );

    await runLoginFlow();

    expect(mockWriteProjectSession).toHaveBeenCalledOnce();
    expect(mockWriteProjectSession).toHaveBeenCalledWith(expect.any(String), oauthSession);
    expect(mockDeleteSession).toHaveBeenCalledOnce();
    // Global writeSession must NOT be called
    expect(mockWriteSession).not.toHaveBeenCalled();

    // Team fetch happens over an OAuth-authenticated client (built from the access token)
    expect(teamsFn).toHaveBeenCalledOnce();
    expect(mockWriteConfig).toHaveBeenCalledWith(
      '/tmp/test-linear-cli/.linear/config.toml',
      expect.objectContaining({ team_id: 'team-2' })
    );
  });
});

describe('runLoginFlow — team select step', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and lists teams after API key validation, with no free-text escape option', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: TWO_TEAMS });
    mockSelect
      .mockResolvedValueOnce('global')
      .mockResolvedValueOnce('apikey')
      .mockResolvedValueOnce('team-1');
    mockText.mockResolvedValueOnce('lin_api_key');
    mockIsCancel.mockReturnValue(false);

    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-5', name: 'Five' }, teamsFn)
    );
    mockWriteSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeSession
    >);

    await runLoginFlow();

    expect(teamsFn).toHaveBeenCalledOnce();

    // The 3rd select() call is the team-select step — must offer exactly the
    // fetched teams as options, with no free-text/custom-entry choice.
    const teamSelectCall = mockSelect.mock.calls[2][0] as {
      options: Array<{ value: string; label: string }>;
    };
    expect(teamSelectCall.options).toHaveLength(2);
    expect(teamSelectCall.options.map((o) => o.value)).toEqual(['team-1', 'team-2']);
    expect(teamSelectCall.options.some((o) => /custom|other|type|manual/i.test(o.label))).toBe(
      false
    );
  });

  it('pre-selects the sole team as the default (prompt still shown, not skipped)', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: ONE_TEAM });
    mockSelect
      .mockResolvedValueOnce('global')
      .mockResolvedValueOnce('apikey')
      .mockResolvedValueOnce('team-solo');
    mockText.mockResolvedValueOnce('lin_api_key');
    mockIsCancel.mockReturnValue(false);

    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-6', name: 'Six' }, teamsFn)
    );
    mockWriteSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeSession
    >);

    await runLoginFlow();

    // The team-select prompt must still have been invoked (not silently skipped)...
    expect(mockSelect).toHaveBeenCalledTimes(3);
    const teamSelectCall = mockSelect.mock.calls[2][0] as {
      options: Array<{ value: string; label: string }>;
      initialValue?: string;
    };
    // ...with the sole team pre-selected as the initial value.
    expect(teamSelectCall.initialValue).toBe('team-solo');
    expect(teamSelectCall.options).toHaveLength(1);
  });

  it('does not crash and writes no team_id when the user has zero teams', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: [] });
    mockSelect.mockResolvedValueOnce('global').mockResolvedValueOnce('apikey');
    mockText.mockResolvedValueOnce('lin_api_key');
    mockIsCancel.mockReturnValue(false);

    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-7', name: 'Seven' }, teamsFn)
    );
    mockWriteSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeSession
    >);

    await runLoginFlow();

    // Only scope + method selects — no team select shown when there are no teams.
    expect(mockSelect).toHaveBeenCalledTimes(2);
    // No team was resolved this run — config.toml must not be touched at all
    // (not even written empty), so a pre-existing config on disk survives.
    expect(mockWriteConfig).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// config.toml merge/preserve behavior — see code review follow-up: writeConfig
// used to be called unconditionally with a fresh `{}`/`{ team_id }`, silently
// wiping any pre-existing team_id/workspace when team-select yields no team
// (fetch failure, empty list, or user cancel).
// ---------------------------------------------------------------------------
describe('runLoginFlow — config.toml preserve/merge on write', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockReadConfig.mockReturnValue({});
  });

  it('preserves a pre-existing team_id/workspace when team fetch fails (Global scope)', async () => {
    const teamsFn = vi.fn().mockRejectedValue(new Error('network down'));
    mockSelect.mockResolvedValueOnce('global').mockResolvedValueOnce('apikey');
    mockText.mockResolvedValueOnce('lin_api_key');
    mockIsCancel.mockReturnValue(false);
    mockReadConfig.mockReturnValue({ team_id: 'existing-team', workspace: 'acme' });

    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-10', name: 'Ten' }, teamsFn)
    );
    mockWriteSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeSession
    >);

    await runLoginFlow();

    // No team resolved this run — config.toml must not be written at all,
    // so the pre-existing team_id/workspace already on disk survives untouched.
    expect(mockWriteConfig).not.toHaveBeenCalled();
  });

  it('preserves a pre-existing team_id/workspace when team fetch fails (Project scope)', async () => {
    const teamsFn = vi.fn().mockRejectedValue(new Error('network down'));
    mockSelect.mockResolvedValueOnce('project').mockResolvedValueOnce('apikey');
    mockText.mockResolvedValueOnce('lin_api_key');
    mockIsCancel.mockReturnValue(false);
    mockReadConfig.mockReturnValue({ team_id: 'existing-team', workspace: 'acme' });

    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-11', name: 'Eleven' }, teamsFn)
    );
    mockWriteProjectSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeProjectSession
    >);

    await runLoginFlow();

    expect(mockWriteConfig).not.toHaveBeenCalled();
  });

  it('preserves a pre-existing team_id when the user cancels the team-select prompt', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: TWO_TEAMS });
    mockSelect
      .mockResolvedValueOnce('global')
      .mockResolvedValueOnce('apikey')
      .mockResolvedValueOnce(undefined); // team select cancelled
    mockText.mockResolvedValueOnce('lin_api_key');
    mockIsCancel.mockImplementation((v) => v === undefined);
    mockReadConfig.mockReturnValue({ team_id: 'existing-team' });

    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-12', name: 'Twelve' }, teamsFn)
    );
    mockWriteSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeSession
    >);

    await runLoginFlow();

    expect(mockWriteConfig).not.toHaveBeenCalled();
  });

  it('merges the newly-resolved team_id onto the existing config, preserving other keys', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: TWO_TEAMS });
    mockSelect
      .mockResolvedValueOnce('global')
      .mockResolvedValueOnce('apikey')
      .mockResolvedValueOnce('team-1');
    mockText.mockResolvedValueOnce('lin_api_key');
    mockIsCancel.mockReturnValue(false);
    mockReadConfig.mockReturnValue({ team_id: 'stale-team', workspace: 'acme' });

    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-13', name: 'Thirteen' }, teamsFn)
    );
    mockWriteSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeSession
    >);

    await runLoginFlow();

    expect(mockWriteConfig).toHaveBeenCalledWith(
      '/tmp/test-linear-cli/config.toml',
      expect.objectContaining({ team_id: 'team-1', workspace: 'acme' })
    );
  });
});

describe('runLoginFlow — no workspace prompt', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('never prompts for workspace and never writes a workspace value (Global scope)', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: ONE_TEAM });
    mockSelect
      .mockResolvedValueOnce('global')
      .mockResolvedValueOnce('apikey')
      .mockResolvedValueOnce('team-solo');
    mockText.mockResolvedValueOnce('lin_api_key');
    mockIsCancel.mockReturnValue(false);

    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-8', name: 'Eight' }, teamsFn)
    );
    mockWriteSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeSession
    >);

    await runLoginFlow();

    // text() is only ever used for the API key entry — never for workspace/team-id
    expect(mockText).toHaveBeenCalledTimes(1);
    for (const call of mockText.mock.calls) {
      const arg = call[0] as { message: string };
      expect(arg.message.toLowerCase()).not.toContain('workspace');
    }
    for (const call of mockWriteConfig.mock.calls) {
      const config = call[1] as Record<string, unknown>;
      expect(config).not.toHaveProperty('workspace');
    }
  });

  it('never prompts for workspace and never writes a workspace value (Project scope)', async () => {
    const teamsFn = vi.fn().mockResolvedValue({ nodes: ONE_TEAM });
    mockSelect
      .mockResolvedValueOnce('project')
      .mockResolvedValueOnce('apikey')
      .mockResolvedValueOnce('team-solo');
    mockText.mockResolvedValueOnce('lin_api_key');
    mockIsCancel.mockReturnValue(false);

    MockLinearClient.mockImplementation(() =>
      makeClientMock({ id: 'user-9', name: 'Nine' }, teamsFn)
    );
    mockWriteProjectSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeProjectSession
    >);

    await runLoginFlow();

    expect(mockText).toHaveBeenCalledTimes(1);
    for (const call of mockText.mock.calls) {
      const arg = call[0] as { message: string };
      expect(arg.message.toLowerCase()).not.toContain('workspace');
    }
    for (const call of mockWriteConfig.mock.calls) {
      const config = call[1] as Record<string, unknown>;
      expect(config).not.toHaveProperty('workspace');
    }
  });
});
