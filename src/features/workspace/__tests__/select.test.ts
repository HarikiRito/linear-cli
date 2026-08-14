import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// All mocks must be registered before the module under test is imported.
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  select: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
}));

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn(),
}));

vi.mock('../../auth/credentials.js', () => ({
  listWorkspaceCredentials: vi.fn(),
  writeWorkspaceCredential: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../auth/login.js', () => ({
  authenticateWorkspace: vi.fn(),
}));

vi.mock('../../auth/session.js', () => ({
  isApiKeySession: (s: unknown) => typeof s === 'object' && s !== null && 'apiKey' in s,
  isOAuthSession: (s: unknown) => typeof s === 'object' && s !== null && 'accessToken' in s,
}));

vi.mock('../../auth/team-select.js', () => ({
  selectDefaultTeam: vi.fn().mockResolvedValue({ id: 'team-1', key: 'ENG' }),
}));

vi.mock('../../keepalive/registry.js', () => ({
  getEntry: vi.fn(),
  linkProject: vi.fn().mockResolvedValue({}),
}));

import { isCancel, select } from '@clack/prompts';
import { LinearClient } from '@linear/sdk';
import { listWorkspaceCredentials, writeWorkspaceCredential } from '../../auth/credentials.js';
import { authenticateWorkspace } from '../../auth/login.js';
import { selectDefaultTeam } from '../../auth/team-select.js';
import { getEntry, linkProject, type RegisteredProject } from '../../keepalive/registry.js';
import { runWorkspaceSelect } from '../select.js';

const mockSelect = vi.mocked(select);
const mockIsCancel = vi.mocked(isCancel);
const mockListWorkspaceCredentials = vi.mocked(listWorkspaceCredentials);
const mockWriteWorkspaceCredential = vi.mocked(writeWorkspaceCredential);
const mockAuthenticateWorkspace = vi.mocked(authenticateWorkspace);
const mockSelectDefaultTeam = vi.mocked(selectDefaultTeam);
const mockGetEntry = vi.mocked(getEntry);
const mockLinkProject = vi.mocked(linkProject);
const MockLinearClient = vi.mocked(LinearClient);

describe('runWorkspaceSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
    mockSelectDefaultTeam.mockResolvedValue({ id: 'team-1', key: 'ENG' });
    mockGetEntry.mockReturnValue(undefined);
    // Stored workspaces ping the Linear API; default to a valid one.
    MockLinearClient.mockImplementation(
      () =>
        ({
          organization: Promise.resolve({ id: 'ws-1', name: 'Acme', urlKey: 'acme' }),
        }) as unknown as InstanceType<typeof LinearClient>
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists authed workspaces; picking one links the cwd with the picked team', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockSelect.mockResolvedValue('ws-1');

    await runWorkspaceSelect();

    // workspace list prompt (team pick is mocked via selectDefaultTeam)
    expect(mockSelect).toHaveBeenCalledTimes(1);
    const wsPrompt = mockSelect.mock.calls[0][0] as { options: Array<{ value: string }> };
    expect(wsPrompt.options).toContainEqual(expect.objectContaining({ value: 'ws-1' }));
    expect(wsPrompt.options).toContainEqual(expect.objectContaining({ value: '__new__' }));
    expect(mockSelectDefaultTeam).toHaveBeenCalledOnce();
    expect(mockLinkProject).toHaveBeenCalledWith(expect.any(String), 'ws-1', {
      id: 'team-1',
      key: 'ENG',
    });
  });

  it('marks a workspace invalid when the org ping fails', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-bad': { apiKey: 'bad' } });
    MockLinearClient.mockImplementation(
      () =>
        ({
          get organization() {
            return Promise.reject(new Error('401'));
          },
        }) as unknown as InstanceType<typeof LinearClient>
    );
    mockAuthenticateWorkspace.mockResolvedValue({
      workspaceId: 'ws-fresh',
      name: 'Acme',
      urlKey: 'acme',
      session: { apiKey: 'new-key' },
      client: {} as InstanceType<typeof LinearClient>,
    });
    mockSelect.mockResolvedValue('ws-bad');

    await runWorkspaceSelect();

    const wsPrompt = mockSelect.mock.calls[0][0] as { options: Array<{ label: string }> };
    expect(wsPrompt.options[0].label).toContain('invalid');
  });

  it('picking an invalid workspace re-authenticates and links the fresh credential', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-bad': { apiKey: 'bad' } });
    MockLinearClient.mockImplementation(
      () =>
        ({
          get organization() {
            return Promise.reject(new Error('401'));
          },
        }) as unknown as InstanceType<typeof LinearClient>
    );
    mockAuthenticateWorkspace.mockResolvedValue({
      workspaceId: 'ws-fresh',
      name: 'Acme',
      urlKey: 'acme',
      session: { apiKey: 'fresh-key' },
      client: {} as InstanceType<typeof LinearClient>,
    });
    mockSelect.mockResolvedValue('ws-bad');

    await runWorkspaceSelect();

    // Re-auth ran and persisted the fresh session over the dead credential…
    expect(mockAuthenticateWorkspace).toHaveBeenCalledOnce();
    expect(mockWriteWorkspaceCredential).toHaveBeenCalledWith('ws-fresh', { apiKey: 'fresh-key' });
    // …and the directory links to the fresh workspace, never the dead one.
    expect(mockLinkProject).toHaveBeenCalledWith(expect.any(String), 'ws-fresh', {
      id: 'team-1',
      key: 'ENG',
    });
    expect(mockLinkProject).not.toHaveBeenCalledWith(
      expect.any(String),
      'ws-bad',
      expect.anything()
    );
  });

  it('"Authenticate a new workspace" runs the login flow and links the new id', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({});
    mockSelect.mockResolvedValueOnce('__new__').mockResolvedValueOnce('team-1'); // team pick
    mockAuthenticateWorkspace.mockResolvedValue({
      workspaceId: 'ws-new',
      name: 'NewCo',
      urlKey: 'newco',
      session: { apiKey: 'new-key' },
      client: {} as InstanceType<typeof LinearClient>,
    });

    await runWorkspaceSelect();

    expect(mockWriteWorkspaceCredential).toHaveBeenCalledWith('ws-new', { apiKey: 'new-key' });
    expect(mockLinkProject).toHaveBeenCalledWith(expect.any(String), 'ws-new', {
      id: 'team-1',
      key: 'ENG',
    });
  });

  it('confirms before replacing an existing link to a different workspace', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockGetEntry.mockReturnValue({ root: '/cwd', workspace: 'ws-old' } as RegisteredProject);
    mockSelect
      .mockResolvedValueOnce('ws-1') // workspace pick
      .mockResolvedValueOnce(true) // replace confirm
      .mockResolvedValueOnce('team-1'); // team pick

    await runWorkspaceSelect();

    expect(mockLinkProject).toHaveBeenCalledWith(expect.any(String), 'ws-1', {
      id: 'team-1',
      key: 'ENG',
    });
  });

  it('leaves the existing link untouched when the user declines to replace', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockGetEntry.mockReturnValue({ root: '/cwd', workspace: 'ws-old' } as RegisteredProject);
    mockSelect
      .mockResolvedValueOnce('ws-1') // workspace pick
      .mockResolvedValueOnce(false); // decline replace
    mockIsCancel.mockImplementation((v) => v === false);

    await runWorkspaceSelect();

    expect(mockLinkProject).not.toHaveBeenCalled();
  });
});
