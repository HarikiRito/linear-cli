import { err, ok } from 'neverthrow';
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
  selectDefaultProjects: vi.fn().mockResolvedValue(undefined),
  mergeGlobalConfig: vi.fn(),
  persistLinkedProjects: vi.fn().mockResolvedValue(undefined),
  resolveTeamByKeyOrName: vi.fn(),
  resolveTeamProjectsByName: vi.fn(),
  resolveAllTeamProjects: vi.fn(),
}));

vi.mock('../../keepalive/registry.js', () => ({
  getEntry: vi.fn(),
  linkProject: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../lib/confirm.js', () => ({
  confirmDestructive: vi.fn(),
}));

import { isCancel, select } from '@clack/prompts';
import { LinearClient } from '@linear/sdk';
import { confirmDestructive } from '../../../lib/confirm.js';
import { ValidationError } from '../../../lib/errors.js';
import { listWorkspaceCredentials, writeWorkspaceCredential } from '../../auth/credentials.js';
import { authenticateWorkspace } from '../../auth/login.js';
import {
  mergeGlobalConfig,
  persistLinkedProjects,
  resolveAllTeamProjects,
  resolveTeamByKeyOrName,
  resolveTeamProjectsByName,
  selectDefaultProjects,
  selectDefaultTeam,
} from '../../auth/team-select.js';
import { getEntry, linkProject, type RegisteredProject } from '../../keepalive/registry.js';
import {
  runWorkspaceSelect,
  runWorkspaceSelectInteractive,
  runWorkspaceSelectNonInteractive,
} from '../select.js';

const mockSelect = vi.mocked(select);
const mockIsCancel = vi.mocked(isCancel);
const mockListWorkspaceCredentials = vi.mocked(listWorkspaceCredentials);
const mockWriteWorkspaceCredential = vi.mocked(writeWorkspaceCredential);
const mockAuthenticateWorkspace = vi.mocked(authenticateWorkspace);
const mockSelectDefaultTeam = vi.mocked(selectDefaultTeam);
const mockSelectDefaultProjects = vi.mocked(selectDefaultProjects);
const mockMergeGlobalConfig = vi.mocked(mergeGlobalConfig);
const mockGetEntry = vi.mocked(getEntry);
const mockLinkProject = vi.mocked(linkProject);
const mockPersistLinkedProjects = vi.mocked(persistLinkedProjects);
const mockConfirmDestructive = vi.mocked(confirmDestructive);
const mockResolveTeamByKeyOrName = vi.mocked(resolveTeamByKeyOrName);
const mockResolveTeamProjectsByName = vi.mocked(resolveTeamProjectsByName);
const mockResolveAllTeamProjects = vi.mocked(resolveAllTeamProjects);
const MockLinearClient = vi.mocked(LinearClient);

describe('runWorkspaceSelectInteractive (pre-H-645 flow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
    mockSelectDefaultTeam.mockResolvedValue({ id: 'team-1', key: 'ENG' });
    mockSelectDefaultProjects.mockResolvedValue(undefined);
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

    await runWorkspaceSelectInteractive();

    // workspace list prompt (team pick is mocked via selectDefaultTeam)
    expect(mockSelect).toHaveBeenCalledTimes(1);
    const wsPrompt = mockSelect.mock.calls[0][0] as { options: Array<{ value: string }> };
    expect(wsPrompt.options).toContainEqual(expect.objectContaining({ value: 'ws-1' }));
    expect(wsPrompt.options).toContainEqual(expect.objectContaining({ value: '__new__' }));
    expect(mockSelectDefaultTeam).toHaveBeenCalledOnce();
    expect(mockSelectDefaultProjects).toHaveBeenCalledWith(expect.anything(), 'team-1');
    expect(mockLinkProject).toHaveBeenCalledWith(expect.any(String), 'ws-1', {
      id: 'team-1',
      key: 'ENG',
    });
  });

  it('1 project auto-selects and persists it to global config without prompting', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockSelect.mockResolvedValue('ws-1');
    mockSelectDefaultProjects.mockResolvedValue([{ id: 'proj-1', name: 'Roadmap' }]);

    await runWorkspaceSelectInteractive();

    expect(mockMergeGlobalConfig).toHaveBeenCalledWith({
      projects: [{ id: 'proj-1', name: 'Roadmap' }],
    });
    expect(mockPersistLinkedProjects).toHaveBeenCalledWith(expect.any(String), [
      { id: 'proj-1', name: 'Roadmap' },
    ]);
  });

  it('2+ projects prompts (via selectDefaultProjects) and persists the picks', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockSelect.mockResolvedValue('ws-1');
    mockSelectDefaultProjects.mockResolvedValue([
      { id: 'proj-1', name: 'Roadmap' },
      { id: 'proj-2', name: 'Infra' },
    ]);

    await runWorkspaceSelectInteractive();

    expect(mockSelectDefaultProjects).toHaveBeenCalledWith(expect.anything(), 'team-1');
    expect(mockMergeGlobalConfig).toHaveBeenCalledWith({
      projects: [
        { id: 'proj-1', name: 'Roadmap' },
        { id: 'proj-2', name: 'Infra' },
      ],
    });
    expect(mockPersistLinkedProjects).toHaveBeenCalledWith(expect.any(String), [
      { id: 'proj-1', name: 'Roadmap' },
      { id: 'proj-2', name: 'Infra' },
    ]);
  });

  it('does not merge the global config default when no projects are selected, but still persists (clears) the registry scope', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockSelect.mockResolvedValue('ws-1');
    mockSelectDefaultProjects.mockResolvedValue(undefined);

    await runWorkspaceSelectInteractive();

    expect(mockMergeGlobalConfig).not.toHaveBeenCalled();
    expect(mockPersistLinkedProjects).toHaveBeenCalledWith(expect.any(String), undefined);
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

    await runWorkspaceSelectInteractive();

    const wsPrompt = mockSelect.mock.calls[0][0] as { options: Array<{ label: string }> };
    expect(wsPrompt.options[0].label).toContain('invalid');
  });

  it('marks a workspace unreachable (not invalid) when the org ping fails with a network error', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-flaky': { apiKey: 'flaky' } });
    MockLinearClient.mockImplementation(
      () =>
        ({
          get organization() {
            return Promise.reject(new Error('fetch failed'));
          },
        }) as unknown as InstanceType<typeof LinearClient>
    );
    mockSelect.mockResolvedValue('ws-flaky');

    await runWorkspaceSelectInteractive();

    const wsPrompt = mockSelect.mock.calls[0][0] as { options: Array<{ label: string }> };
    expect(wsPrompt.options[0].label).toContain('unreachable');
    // Never forces OAuth for a transient failure — the raw stored token is reused.
    expect(mockAuthenticateWorkspace).not.toHaveBeenCalled();
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

    await runWorkspaceSelectInteractive();

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

    await runWorkspaceSelectInteractive();

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

    await runWorkspaceSelectInteractive();

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

    await runWorkspaceSelectInteractive();

    expect(mockLinkProject).not.toHaveBeenCalled();
  });
});

describe('runWorkspaceSelect: dispatch (H-645)', () => {
  const realStdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  const realStdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

  function setTty(value: boolean | undefined): void {
    Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntry.mockReturnValue(undefined);
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    MockLinearClient.mockImplementation(
      () =>
        ({
          organization: Promise.resolve({ id: 'ws-1', name: 'Acme', urlKey: 'acme' }),
        }) as unknown as InstanceType<typeof LinearClient>
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process.stdin, 'isTTY', {
      value: realStdinTty?.value,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: realStdoutTty?.value,
      configurable: true,
    });
  });

  it('TTY + no flags runs the interactive picker unchanged', async () => {
    setTty(true);
    mockSelect.mockResolvedValue('ws-1');
    mockIsCancel.mockReturnValue(false);
    mockSelectDefaultTeam.mockResolvedValue(undefined);

    await runWorkspaceSelect();

    expect(mockSelect).toHaveBeenCalled();
  });

  it('non-TTY + no flags fails fast with a usage error instead of hanging', async () => {
    setTty(false);

    await expect(runWorkspaceSelect()).rejects.toThrow(/--workspace is required/i);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('--workspace flag runs non-interactively even on a TTY', async () => {
    setTty(true);

    await runWorkspaceSelect({ workspace: 'ws-1' });

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockLinkProject).toHaveBeenCalledWith(expect.any(String), 'ws-1', undefined);
  });

  // H-646 review: `plain` (isPlain(cmd)'s resolved value, which also reflects
  // LINEAR_OUTPUT/config) must not be conflated with an explicitly-passed
  // --plain/--table flag for the hasFlags/interactive-dispatch check.
  it('resolved plain=true from env/config alone (no explicit flag) still runs the interactive picker', async () => {
    setTty(true);
    mockSelect.mockResolvedValue('ws-1');
    mockIsCancel.mockReturnValue(false);
    mockSelectDefaultTeam.mockResolvedValue(undefined);

    await runWorkspaceSelect({ plain: true });

    expect(mockSelect).toHaveBeenCalled();
  });

  it('explicit --plain (explicitOutputFlag) still counts as a flag and skips the interactive picker', async () => {
    setTty(true);

    await expect(runWorkspaceSelect({ plain: true, explicitOutputFlag: true })).rejects.toThrow(
      /--workspace is required/i
    );
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

describe('runWorkspaceSelectNonInteractive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntry.mockReturnValue(undefined);
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

  it('throws a usage error when --workspace is missing', async () => {
    await expect(runWorkspaceSelectNonInteractive({})).rejects.toThrow(/--workspace is required/i);
    expect(mockListWorkspaceCredentials).not.toHaveBeenCalled();
  });

  it('resolves --workspace by raw id directly, without probing other stored workspaces', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({
      'ws-1': { apiKey: 'key' },
      'ws-2': { apiKey: 'other' },
    });

    await runWorkspaceSelectNonInteractive({ workspace: 'ws-1' });

    // ws-1's client is built twice (status probe + actual use) — ws-2 is never probed at all.
    expect(MockLinearClient).toHaveBeenCalledTimes(2);
    expect(mockLinkProject).toHaveBeenCalledWith(expect.any(String), 'ws-1', undefined);
  });

  it('resolves --workspace by urlKey (probing all stored workspaces)', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });

    await runWorkspaceSelectNonInteractive({ workspace: 'acme' });

    expect(mockLinkProject).toHaveBeenCalledWith(expect.any(String), 'ws-1', undefined);
  });

  it('unknown workspace query throws NotFoundError listing valid choices', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });

    await expect(runWorkspaceSelectNonInteractive({ workspace: 'nope' })).rejects.toThrow(
      /not found/i
    );
  });

  it('ambiguous workspace query throws AmbiguousMatchError', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({
      'ws-1': { apiKey: 'key1' },
      'ws-2': { apiKey: 'key2' },
    });
    MockLinearClient.mockImplementation(
      () =>
        ({
          organization: Promise.resolve({ id: 'dup', name: 'Duplicate', urlKey: 'dup' }),
        }) as unknown as InstanceType<typeof LinearClient>
    );

    await expect(runWorkspaceSelectNonInteractive({ workspace: 'Duplicate' })).rejects.toThrow(
      /ambiguous/i
    );
  });

  it('an invalid (needs re-auth) workspace throws an AuthError and never opens a browser', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-bad': { apiKey: 'bad' } });
    MockLinearClient.mockImplementation(
      () =>
        ({
          get organization() {
            return Promise.reject(new Error('401'));
          },
        }) as unknown as InstanceType<typeof LinearClient>
    );

    await expect(runWorkspaceSelectNonInteractive({ workspace: 'ws-bad' })).rejects.toThrow(
      /re-authentication/i
    );
    expect(mockAuthenticateWorkspace).not.toHaveBeenCalled();
  });

  it('an unreachable workspace still links using the raw stored token (never forces re-auth)', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-flaky': { apiKey: 'flaky' } });
    MockLinearClient.mockImplementation(
      () =>
        ({
          get organization() {
            return Promise.reject(new Error('fetch failed'));
          },
        }) as unknown as InstanceType<typeof LinearClient>
    );

    await runWorkspaceSelectNonInteractive({ workspace: 'ws-flaky' });

    expect(mockAuthenticateWorkspace).not.toHaveBeenCalled();
    expect(mockLinkProject).toHaveBeenCalledWith(expect.any(String), 'ws-flaky', undefined);
  });

  it('replacing an existing link without --yes exits with an error and does not link', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockGetEntry.mockReturnValue({ root: '/cwd', workspace: 'ws-old' } as RegisteredProject);
    mockConfirmDestructive.mockResolvedValue({
      proceed: false,
      error: new ValidationError('Pass --yes to confirm non-interactively.'),
    });

    await expect(runWorkspaceSelectNonInteractive({ workspace: 'ws-1' })).rejects.toThrow(/--yes/i);
    expect(mockLinkProject).not.toHaveBeenCalled();
  });

  it('--yes replaces an existing link without prompting', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockGetEntry.mockReturnValue({ root: '/cwd', workspace: 'ws-old' } as RegisteredProject);
    mockConfirmDestructive.mockResolvedValue({ proceed: true });

    await runWorkspaceSelectNonInteractive({ workspace: 'ws-1', yes: true });

    expect(mockLinkProject).toHaveBeenCalledWith(expect.any(String), 'ws-1', undefined);
  });

  it('resolves --team and links with the resolved team', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockResolveTeamByKeyOrName.mockReturnValue(
      ok({ id: 'team-1', key: 'ENG' }) as unknown as ReturnType<typeof resolveTeamByKeyOrName>
    );

    await runWorkspaceSelectNonInteractive({ workspace: 'ws-1', team: 'ENG' });

    expect(mockLinkProject).toHaveBeenCalledWith(expect.any(String), 'ws-1', {
      id: 'team-1',
      key: 'ENG',
    });
  });

  it('--all-projects requires --team', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });

    await expect(
      runWorkspaceSelectNonInteractive({ workspace: 'ws-1', allProjects: true })
    ).rejects.toThrow(/--all-projects requires --team/i);
  });

  it('--team + --all-projects merges every team project into the global config', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockResolveTeamByKeyOrName.mockReturnValue(
      ok({ id: 'team-1', key: 'ENG' }) as unknown as ReturnType<typeof resolveTeamByKeyOrName>
    );
    mockResolveAllTeamProjects.mockReturnValue(
      ok([{ id: 'proj-1', name: 'Roadmap' }]) as unknown as ReturnType<
        typeof resolveAllTeamProjects
      >
    );

    await runWorkspaceSelectNonInteractive({ workspace: 'ws-1', team: 'ENG', allProjects: true });

    expect(mockMergeGlobalConfig).toHaveBeenCalledWith({
      projects: [{ id: 'proj-1', name: 'Roadmap' }],
    });
  });

  it('--team + --projects resolves the named projects scoped to the team', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockResolveTeamByKeyOrName.mockReturnValue(
      ok({ id: 'team-1', key: 'ENG' }) as unknown as ReturnType<typeof resolveTeamByKeyOrName>
    );
    mockResolveTeamProjectsByName.mockReturnValue(
      ok([{ id: 'proj-1', name: 'AI Code Review' }]) as unknown as ReturnType<
        typeof resolveTeamProjectsByName
      >
    );

    await runWorkspaceSelectNonInteractive({
      workspace: 'ws-1',
      team: 'ENG',
      projects: 'AI Code Review',
      yes: true,
    });

    expect(mockResolveTeamProjectsByName).toHaveBeenCalledWith(
      'team-1',
      ['AI Code Review'],
      expect.anything()
    );
    expect(mockPersistLinkedProjects).toHaveBeenCalledWith(expect.any(String), [
      { id: 'proj-1', name: 'AI Code Review' },
    ]);
  });

  it('propagates an AmbiguousMatchError from an ambiguous --team', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockResolveTeamByKeyOrName.mockReturnValue(
      err(new Error("ambiguous team 'e'")) as unknown as ReturnType<typeof resolveTeamByKeyOrName>
    );

    await expect(
      runWorkspaceSelectNonInteractive({ workspace: 'ws-1', team: 'e' })
    ).rejects.toThrow(/ambiguous/i);
    expect(mockLinkProject).not.toHaveBeenCalled();
  });

  it('plain output prints root/workspace/team/projects lines', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'key' } });
    mockResolveTeamByKeyOrName.mockReturnValue(
      ok({ id: 'team-1', key: 'ENG' }) as unknown as ReturnType<typeof resolveTeamByKeyOrName>
    );

    await runWorkspaceSelectNonInteractive({ workspace: 'ws-1', team: 'ENG', plain: true });

    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^root: /));
    expect(log).toHaveBeenCalledWith('workspace: Acme');
    expect(log).toHaveBeenCalledWith('team: ENG');
    log.mockRestore();
  });
});
