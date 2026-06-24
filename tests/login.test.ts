import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for runLoginFlow — exercises the real implementation with mocked I/O and SDK.
 * Key scenario from the plan: "invalid API key is rejected and auth.json not written"
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
  getProjectConfigPath: vi.fn().mockReturnValue('/tmp/test-linear-cli/.linear/config.toml'),
  writeConfig: vi.fn().mockReturnValue({ isErr: () => false, isOk: () => true }),
}));

vi.mock('../src/lib/gitignore.js', () => ({
  appendAuthToGitignore: vi.fn().mockReturnValue({ isErr: () => false, isOk: () => true }),
}));

import { isCancel, select, text } from '@clack/prompts';
import { LinearClient } from '@linear/sdk';
import { runLoginFlow } from '../src/features/auth/login.js';
import { startOAuthFlow } from '../src/features/auth/oauth.js';
import { deleteSession, readSession, writeProjectSession, writeSession } from '../src/features/auth/session.js';

const mockSelect = vi.mocked(select);
const mockText = vi.mocked(text);
const mockIsCancel = vi.mocked(isCancel);
const mockWriteSession = vi.mocked(writeSession);
const mockWriteProjectSession = vi.mocked(writeProjectSession);
const mockReadSession = vi.mocked(readSession);
const mockDeleteSession = vi.mocked(deleteSession);
const mockStartOAuthFlow = vi.mocked(startOAuthFlow);
const MockLinearClient = vi.mocked(LinearClient);

describe('runLoginFlow — invalid API key', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT call writeSession when LinearClient.viewer rejects (invalid key)', async () => {
    // Arrange: first select = scope ('global'), second select = method ('apikey')
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
    mockSelect.mockResolvedValueOnce('global').mockResolvedValueOnce('apikey');
    mockText.mockResolvedValue('lin_api_valid_key');
    mockIsCancel.mockReturnValue(false);

    MockLinearClient.mockImplementation(
      () =>
        ({
          viewer: Promise.resolve({ id: 'user-1', name: 'Test User', email: 'test@example.com' }),
        }) as unknown as InstanceType<typeof LinearClient>
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
    // scope = 'project', method = 'apikey', valid key
    mockSelect
      .mockResolvedValueOnce('project') // scope selection
      .mockResolvedValueOnce('apikey'); // method selection
    // text: API key, then optional team/workspace prompts (skip both)
    mockText
      .mockResolvedValueOnce('lin_api_proj_key')
      .mockResolvedValueOnce('') // team id (skip)
      .mockResolvedValueOnce(''); // workspace (skip)
    mockIsCancel.mockReturnValue(false);

    MockLinearClient.mockImplementation(
      () =>
        ({
          viewer: Promise.resolve({ id: 'user-2', name: 'Project User', email: 'proj@example.com' }),
        }) as unknown as InstanceType<typeof LinearClient>
    );

    mockWriteProjectSession.mockReturnValue({
      isErr: () => false,
      isOk: () => true,
    } as ReturnType<typeof writeProjectSession>);

    await runLoginFlow();

    // writeProjectSession should be called with the API key
    expect(mockWriteProjectSession).toHaveBeenCalledOnce();
    expect(mockWriteProjectSession).toHaveBeenCalledWith(
      expect.any(String),
      { apiKey: 'lin_api_proj_key' }
    );

    // writeSession (global) must NOT be called
    expect(mockWriteSession).not.toHaveBeenCalled();
  });

  it('does NOT call writeProjectSession on global-scope API key login', async () => {
    // scope = 'global', method = 'apikey', valid key
    mockSelect
      .mockResolvedValueOnce('global') // scope selection
      .mockResolvedValueOnce('apikey'); // method selection
    mockText.mockResolvedValueOnce('lin_api_global_key');
    mockIsCancel.mockReturnValue(false);

    MockLinearClient.mockImplementation(
      () =>
        ({
          viewer: Promise.resolve({ id: 'user-3', name: 'Global User', email: 'global@example.com' }),
        }) as unknown as InstanceType<typeof LinearClient>
    );

    mockWriteSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeSession
    >);

    await runLoginFlow();

    expect(mockWriteSession).toHaveBeenCalledOnce();
    expect(mockWriteProjectSession).not.toHaveBeenCalled();
  });
});

describe('runLoginFlow — OAuth + project-scope login', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls writeProjectSession with OAuth session and deleteSession when scope=project and method=oauth', async () => {
    // scope = 'project', method = 'oauth'
    mockSelect
      .mockResolvedValueOnce('project') // scope selection
      .mockResolvedValueOnce('oauth');  // method selection
    // project-scope path prompts for teamId and workspace (skip both)
    mockText
      .mockResolvedValueOnce('') // team id (skip)
      .mockResolvedValueOnce(''); // workspace (skip)
    mockIsCancel.mockReturnValue(false);

    const oauthSession = { accessToken: 'tok_abc', refreshToken: 'ref_xyz', expiresAt: 9999999999 };

    mockStartOAuthFlow.mockResolvedValue({ isErr: () => false, isOk: () => true } as Awaited<
      ReturnType<typeof startOAuthFlow>
    >);
    mockReadSession.mockReturnValue(oauthSession);
    mockWriteProjectSession.mockReturnValue({ isErr: () => false, isOk: () => true } as ReturnType<
      typeof writeProjectSession
    >);

    await runLoginFlow();

    expect(mockWriteProjectSession).toHaveBeenCalledOnce();
    expect(mockWriteProjectSession).toHaveBeenCalledWith(expect.any(String), oauthSession);
    expect(mockDeleteSession).toHaveBeenCalledOnce();
    // Global writeSession must NOT be called
    expect(mockWriteSession).not.toHaveBeenCalled();
  });
});
