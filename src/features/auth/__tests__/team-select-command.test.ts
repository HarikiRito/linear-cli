import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// All mocks must be registered before the module under test is imported.
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
}));

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn().mockImplementation((opts: Record<string, unknown>) => ({
    __opts: opts,
  })),
}));

vi.mock('../../../lib/scope.js', () => ({
  findProjectRoot: vi.fn(),
}));

vi.mock('../../../lib/config-file.js', () => ({
  getProjectConfigPath: vi.fn((root: string) => `${root}/.linear/config.toml`),
  getGlobalConfigPath: vi.fn(() => '/global/.config/.linear/config.toml'),
  readConfigIfExists: vi.fn(),
}));

vi.mock('../resolve.js', () => ({
  resolveCredential: vi.fn(),
}));

vi.mock('../login.js', () => ({
  runAuthMethodFlow: vi.fn(),
}));

vi.mock('../team-select.js', () => ({
  selectAndPersistTeamAndProjects: vi.fn(),
}));

import { LinearClient } from '@linear/sdk';
import {
  getGlobalConfigPath,
  getProjectConfigPath,
  readConfigIfExists,
} from '../../../lib/config-file.js';
import { UnauthenticatedError } from '../../../lib/errors.js';
import { findProjectRoot } from '../../../lib/scope.js';
import { runAuthMethodFlow } from '../login.js';
import { resolveCredential } from '../resolve.js';
import { selectAndPersistTeamAndProjects } from '../team-select.js';
import { runTeamSelectFlow } from '../team-select-command.js';

const mockReadConfigIfExists = vi.mocked(readConfigIfExists);
const mockFindProjectRoot = vi.mocked(findProjectRoot);
const mockGetProjectConfigPath = vi.mocked(getProjectConfigPath);
const mockGetGlobalConfigPath = vi.mocked(getGlobalConfigPath);
const mockResolveCredential = vi.mocked(resolveCredential);
const mockRunAuthMethodFlow = vi.mocked(runAuthMethodFlow);
const mockSelectAndPersist = vi.mocked(selectAndPersistTeamAndProjects);
const MockLinearClient = vi.mocked(LinearClient);

describe('runTeamSelectFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('errors when no project root is found (no .linear/ ancestor)', async () => {
    mockFindProjectRoot.mockReturnValue(null);

    await expect(runTeamSelectFlow()).rejects.toThrow(/linear login/i);

    expect(mockReadConfigIfExists).not.toHaveBeenCalled();
    expect(mockResolveCredential).not.toHaveBeenCalled();
    expect(mockSelectAndPersist).not.toHaveBeenCalled();
  });

  it('errors when project root exists but config.toml does not', async () => {
    mockFindProjectRoot.mockReturnValue('/proj');
    mockReadConfigIfExists.mockReturnValue(null);

    await expect(runTeamSelectFlow()).rejects.toThrow(/linear login/i);

    expect(mockGetProjectConfigPath).toHaveBeenCalledWith('/proj');
    expect(mockReadConfigIfExists).toHaveBeenCalledWith('/proj/.linear/config.toml');
    expect(mockResolveCredential).not.toHaveBeenCalled();
    expect(mockSelectAndPersist).not.toHaveBeenCalled();
  });

  it('skips auth prompts and goes straight to selection when a valid session is resolvable', async () => {
    mockFindProjectRoot.mockReturnValue('/proj');
    mockReadConfigIfExists.mockReturnValue({});
    mockResolveCredential.mockReturnValue(
      ok({ type: 'apiKey', value: 'lin_api_key' }) as unknown as ReturnType<
        typeof resolveCredential
      >
    );

    await runTeamSelectFlow();

    expect(mockResolveCredential).toHaveBeenCalledWith({
      allowInteractive: false,
      projectRoot: '/proj',
    });
    expect(mockRunAuthMethodFlow).not.toHaveBeenCalled();
    expect(MockLinearClient).toHaveBeenCalledWith({ apiKey: 'lin_api_key' });
    expect(mockSelectAndPersist).toHaveBeenCalledOnce();
    expect(mockSelectAndPersist).toHaveBeenCalledWith(
      expect.anything(),
      '/proj/.linear/config.toml',
      {}
    );
  });

  it('falls back to the full auth flow (scope hardcoded to project) when no valid session exists', async () => {
    mockFindProjectRoot.mockReturnValue('/proj');
    mockReadConfigIfExists.mockReturnValue({});
    mockResolveCredential.mockReturnValue(
      err(new UnauthenticatedError()) as unknown as ReturnType<typeof resolveCredential>
    );
    const fakeClient = { fake: true } as unknown as InstanceType<typeof LinearClient>;
    mockRunAuthMethodFlow.mockResolvedValue(fakeClient);

    await runTeamSelectFlow();

    expect(mockRunAuthMethodFlow).toHaveBeenCalledWith('project', '/proj');
    expect(mockSelectAndPersist).toHaveBeenCalledWith(fakeClient, '/proj/.linear/config.toml', {});
  });

  it('only ever touches the project-scope config path — global config path is never read', async () => {
    mockFindProjectRoot.mockReturnValue('/proj');
    mockReadConfigIfExists.mockReturnValue({});
    mockResolveCredential.mockReturnValue(
      ok({ type: 'accessToken', value: 'tok' }) as unknown as ReturnType<typeof resolveCredential>
    );

    await runTeamSelectFlow();

    expect(mockGetGlobalConfigPath).not.toHaveBeenCalled();
    const [, configPathArg] = mockSelectAndPersist.mock.calls[0] as [unknown, string, unknown];
    expect(configPathArg).toBe('/proj/.linear/config.toml');
  });

  it('does not run selection when auth fails to produce a client', async () => {
    mockFindProjectRoot.mockReturnValue('/proj');
    mockReadConfigIfExists.mockReturnValue({});
    mockResolveCredential.mockReturnValue(
      err(new UnauthenticatedError()) as unknown as ReturnType<typeof resolveCredential>
    );
    mockRunAuthMethodFlow.mockResolvedValue(undefined);

    await runTeamSelectFlow();

    expect(mockSelectAndPersist).not.toHaveBeenCalled();
  });
});
