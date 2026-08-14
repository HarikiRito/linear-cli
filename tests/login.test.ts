import { okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * runLoginFlow (workspace-keyed):
 * - prompts auth method (OAuth / API key)
 * - writes the credential via writeWorkspaceCredential(workspaceId, session)
 * - TTY: team pick → default-project pick → auto-links cwd (no confirmation)
 * - non-TTY: credential + auto-link only, no team/project prompts
 */

// All mocks must be registered before the module under test is imported.
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
  multiselect: vi.fn(),
  text: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  isCancel: vi.fn().mockReturnValue(false),
}));

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn(),
}));

vi.mock('../src/features/auth/oauth.js', () => ({
  startOAuthFlow: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock('../src/features/auth/credentials.js', () => ({
  writeWorkspaceCredential: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/features/keepalive/registry.js', () => ({
  linkProject: vi.fn().mockResolvedValue({ root: '/linked/root' }),
}));

vi.mock('../src/features/auth/team-select.js', () => ({
  selectDefaultTeam: vi.fn().mockResolvedValue({ id: 'team-1', key: 'ENG' }),
  selectDefaultProjects: vi.fn().mockResolvedValue(undefined),
  mergeGlobalConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/check-version.js', () => ({
  notifyUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { confirm, isCancel, select, text } from '@clack/prompts';
import { LinearClient } from '@linear/sdk';
import { writeWorkspaceCredential } from '../src/features/auth/credentials.js';
import { runLoginFlow } from '../src/features/auth/login.js';
import { startOAuthFlow } from '../src/features/auth/oauth.js';
import {
  mergeGlobalConfig,
  selectDefaultProjects,
  selectDefaultTeam,
} from '../src/features/auth/team-select.js';
import { linkProject } from '../src/features/keepalive/registry.js';

const mockSelect = vi.mocked(select);
const mockText = vi.mocked(text);
const mockConfirm = vi.mocked(confirm);
const mockIsCancel = vi.mocked(isCancel);
const mockStartOAuthFlow = vi.mocked(startOAuthFlow);
const mockWriteWorkspaceCredential = vi.mocked(writeWorkspaceCredential);
const mockLinkProject = vi.mocked(linkProject);
const mockSelectDefaultTeam = vi.mocked(selectDefaultTeam);
const mockSelectDefaultProjects = vi.mocked(selectDefaultProjects);
const mockMergeGlobalConfig = vi.mocked(mergeGlobalConfig);
const MockLinearClient = vi.mocked(LinearClient);

const ORG = { id: 'ws-1', name: 'Acme', urlKey: 'acme' };

/** Make the LinearClient mock resolve an organization. */
function mockOrgClient(org = ORG): void {
  MockLinearClient.mockImplementation(
    () =>
      ({
        organization: Promise.resolve(org),
      }) as unknown as InstanceType<typeof LinearClient>
  );
}

function setTTY(value: boolean): void {
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
}

describe('runLoginFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
    mockOrgClient();
  });

  afterEach(() => {
    setTTY(false);
  });

  it('invalid API key → process.exit(1), credential never written', async () => {
    mockSelect.mockResolvedValue('apikey');
    mockText.mockResolvedValue('lin_api_bad_key');
    MockLinearClient.mockImplementation(
      () =>
        ({
          organization: Promise.reject(new Error('Authentication failed')),
        }) as unknown as InstanceType<typeof LinearClient>
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit(1)');
    });

    await expect(runLoginFlow()).rejects.toThrow('process.exit(1)');
    expect(mockWriteWorkspaceCredential).not.toHaveBeenCalled();

    mockExit.mockRestore();
  });

  it('API key (non-TTY): writes workspace credential and auto-links cwd, no team prompts', async () => {
    mockSelect.mockResolvedValue('apikey');
    mockText.mockResolvedValue('lin_api_good_key');

    await runLoginFlow();

    expect(mockWriteWorkspaceCredential).toHaveBeenCalledOnce();
    expect(mockWriteWorkspaceCredential).toHaveBeenCalledWith('ws-1', {
      apiKey: 'lin_api_good_key',
    });
    // Auto-link happens without a confirmation prompt, with no team.
    expect(mockLinkProject).toHaveBeenCalledWith(process.cwd(), 'ws-1', undefined);
    expect(mockSelectDefaultTeam).not.toHaveBeenCalled();
    expect(mockSelectDefaultProjects).not.toHaveBeenCalled();
  });

  it('OAuth (non-TTY): writes the returned session and auto-links cwd', async () => {
    const oauthSession = {
      accessToken: 'tok_abc',
      refreshToken: 'ref_xyz',
      expiresAt: 9999999999,
      lastRefreshAt: 1234,
    };
    mockSelect.mockResolvedValue('oauth');
    mockStartOAuthFlow.mockReturnValue(okAsync(oauthSession));

    await runLoginFlow();

    expect(mockStartOAuthFlow).toHaveBeenCalledOnce();
    expect(mockWriteWorkspaceCredential).toHaveBeenCalledWith('ws-1', oauthSession);
    expect(mockLinkProject).toHaveBeenCalledWith(process.cwd(), 'ws-1', undefined);
  });

  it('TTY: auto-links cwd with the picked team, no confirmation prompt, project pick writes global config', async () => {
    setTTY(true);
    mockSelect.mockResolvedValue('apikey');
    mockText.mockResolvedValue('lin_api_good_key');
    mockSelectDefaultTeam.mockResolvedValue({ id: 'team-1', key: 'ENG' });
    mockSelectDefaultProjects.mockResolvedValue([{ id: 'proj-1', name: 'Mobile' }]);

    await runLoginFlow();

    expect(mockSelectDefaultTeam).toHaveBeenCalledOnce();
    expect(mockSelectDefaultProjects).toHaveBeenCalledWith(expect.anything(), 'team-1');
    expect(mockMergeGlobalConfig).toHaveBeenCalledWith({
      projects: [{ id: 'proj-1', name: 'Mobile' }],
    });
    // Link is unconditional — no confirm prompt, registry entry gets the team.
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockLinkProject).toHaveBeenCalledWith(process.cwd(), 'ws-1', {
      id: 'team-1',
      key: 'ENG',
    });
  });

  it('TTY: skipped team pick still auto-links cwd without a team', async () => {
    setTTY(true);
    mockSelect.mockResolvedValue('apikey');
    mockText.mockResolvedValue('lin_api_good_key');
    mockSelectDefaultTeam.mockResolvedValue(undefined);

    await runLoginFlow();

    expect(mockSelectDefaultTeam).toHaveBeenCalledOnce();
    expect(mockSelectDefaultProjects).not.toHaveBeenCalled();
    expect(mockMergeGlobalConfig).not.toHaveBeenCalled();
    expect(mockLinkProject).toHaveBeenCalledWith(process.cwd(), 'ws-1', undefined);
  });

  it('OAuth flow failure → process.exit(1), nothing written', async () => {
    mockSelect.mockResolvedValue('oauth');
    mockStartOAuthFlow.mockReturnValue(
      okAsync({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: 0,
      })
    );
    // Organization fetch fails after a successful token exchange
    MockLinearClient.mockImplementation(
      () =>
        ({
          organization: Promise.reject(new Error('network down')),
        }) as unknown as InstanceType<typeof LinearClient>
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit(1)');
    });

    await expect(runLoginFlow()).rejects.toThrow('process.exit(1)');
    expect(mockWriteWorkspaceCredential).not.toHaveBeenCalled();

    mockExit.mockRestore();
  });
});
