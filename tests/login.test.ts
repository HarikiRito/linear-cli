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
  isApiKeySession: (s: unknown) => typeof s === 'object' && s !== null && 'apiKey' in s,
  isOAuthSession: (s: unknown) => typeof s === 'object' && s !== null && 'accessToken' in s,
  getSessionPath: () => '/tmp/test-linear-cli/auth.json',
}));

vi.mock('../src/features/auth/oauth.js', () => ({
  startOAuthFlow: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

import { isCancel, select, text } from '@clack/prompts';
import { LinearClient } from '@linear/sdk';
import { runLoginFlow } from '../src/features/auth/login.js';
import { writeSession } from '../src/features/auth/session.js';

const mockSelect = vi.mocked(select);
const mockText = vi.mocked(text);
const mockIsCancel = vi.mocked(isCancel);
const mockWriteSession = vi.mocked(writeSession);
const MockLinearClient = vi.mocked(LinearClient);

describe('runLoginFlow — invalid API key', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT call writeSession when LinearClient.viewer rejects (invalid key)', async () => {
    // Arrange: select returns 'apikey', text returns a bad key, LinearClient.viewer throws
    mockSelect.mockResolvedValue('apikey');
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
    mockSelect.mockResolvedValue('apikey');
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
    mockSelect.mockResolvedValue('apikey');
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
