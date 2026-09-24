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

vi.mock('../../keepalive/registry.js', () => ({
  getEntry: vi.fn(),
  updateEntry: vi.fn().mockResolvedValue({ isErr: () => false }),
}));

vi.mock('../resolve.js', () => ({
  resolveCredential: vi.fn(),
}));

vi.mock('../login.js', () => ({
  runLoginFlow: vi.fn(),
}));

vi.mock('../team-select.js', () => ({
  selectAndPersistTeamAndProjects: vi.fn(),
  mergeGlobalConfig: vi.fn(),
  resolveTeamByKeyOrName: vi.fn(),
  resolveTeamProjectsByName: vi.fn(),
  resolveAllTeamProjects: vi.fn(),
}));

import { findProjectRoot } from '../../../lib/scope.js';
import { getEntry, type RegisteredProject, updateEntry } from '../../keepalive/registry.js';
import { runLoginFlow } from '../login.js';
import { resolveCredential } from '../resolve.js';
import {
  mergeGlobalConfig,
  resolveAllTeamProjects,
  resolveTeamByKeyOrName,
  resolveTeamProjectsByName,
  selectAndPersistTeamAndProjects,
} from '../team-select.js';
import {
  runTeamSelectFlow,
  runTeamSelectInteractive as runTeamSelectFlowInteractive,
  runTeamSelectNonInteractive,
} from '../team-select-command.js';

const mockFindProjectRoot = vi.mocked(findProjectRoot);
const mockGetEntry = vi.mocked(getEntry);
const mockUpdateEntry = vi.mocked(updateEntry);
const mockResolveCredential = vi.mocked(resolveCredential);
const mockRunLoginFlow = vi.mocked(runLoginFlow);
const mockSelectAndPersist = vi.mocked(selectAndPersistTeamAndProjects);
const mockMergeGlobalConfig = vi.mocked(mergeGlobalConfig);
const mockResolveTeamByKeyOrName = vi.mocked(resolveTeamByKeyOrName);
const mockResolveTeamProjectsByName = vi.mocked(resolveTeamProjectsByName);
const mockResolveAllTeamProjects = vi.mocked(resolveAllTeamProjects);

describe('runTeamSelectInteractive (pre-H-645 flow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes team to the registry entry when cwd is linked to a workspace', async () => {
    mockFindProjectRoot.mockReturnValue('/repo');
    mockGetEntry.mockReturnValue({ root: '/repo', workspace: 'ws-1' } as RegisteredProject);
    mockResolveCredential.mockReturnValue(
      ok({ type: 'apiKey', value: 'lin_api_key' }) as unknown as ReturnType<
        typeof resolveCredential
      >
    );

    await runTeamSelectFlowInteractive();

    expect(mockResolveCredential).toHaveBeenCalledWith({ allowInteractive: false });
    expect(mockSelectAndPersist).toHaveBeenCalledOnce();
    expect(mockSelectAndPersist).toHaveBeenCalledWith(expect.anything(), {
      type: 'registry',
      root: '/repo',
    });
    expect(mockRunLoginFlow).not.toHaveBeenCalled();
  });

  it('writes team to the global config when cwd is not linked', async () => {
    mockFindProjectRoot.mockReturnValue(null);
    mockResolveCredential.mockReturnValue(
      ok({ type: 'accessToken', value: 'tok' }) as unknown as ReturnType<typeof resolveCredential>
    );

    await runTeamSelectFlowInteractive();

    expect(mockSelectAndPersist).toHaveBeenCalledWith(expect.anything(), { type: 'global' });
  });

  it('falls back to runLoginFlow when no credential resolves, then retries', async () => {
    mockFindProjectRoot.mockReturnValue('/repo');
    mockGetEntry.mockReturnValue({ root: '/repo', workspace: 'ws-1' } as RegisteredProject);
    mockResolveCredential
      .mockReturnValueOnce(
        err(new Error('unauthenticated')) as unknown as ReturnType<typeof resolveCredential>
      )
      .mockReturnValueOnce(
        ok({ type: 'apiKey', value: 'lin_api_key' }) as unknown as ReturnType<
          typeof resolveCredential
        >
      );
    mockRunLoginFlow.mockResolvedValue(undefined);

    await runTeamSelectFlowInteractive();

    expect(mockRunLoginFlow).toHaveBeenCalledOnce();
    expect(mockResolveCredential).toHaveBeenCalledTimes(2);
    expect(mockSelectAndPersist).toHaveBeenCalledWith(expect.anything(), {
      type: 'registry',
      root: '/repo',
    });
  });

  it('throws a helpful ValidationError when login + retry both fail and cwd is unlinked', async () => {
    mockFindProjectRoot.mockReturnValue(null);
    mockResolveCredential.mockReturnValue(
      err(new Error('unauthenticated')) as unknown as ReturnType<typeof resolveCredential>
    );
    mockRunLoginFlow.mockResolvedValue(undefined);

    await expect(runTeamSelectFlowInteractive()).rejects.toThrow(
      /linear login.*linear workspace select/i
    );
    expect(mockSelectAndPersist).not.toHaveBeenCalled();
  });
});

describe('runTeamSelectFlow: dispatch (H-645)', () => {
  const realStdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  const realStdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

  function setTty(value: boolean | undefined): void {
    Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindProjectRoot.mockReturnValue(null);
    mockResolveCredential.mockReturnValue(
      ok({ type: 'apiKey', value: 'lin_api_key' }) as unknown as ReturnType<
        typeof resolveCredential
      >
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

  it('TTY + no flags runs the interactive flow unchanged', async () => {
    setTty(true);

    await runTeamSelectFlow();

    expect(mockSelectAndPersist).toHaveBeenCalledOnce();
  });

  it('non-TTY + no flags fails fast with a usage error instead of hanging', async () => {
    setTty(false);

    await expect(runTeamSelectFlow()).rejects.toThrow(/--team is required/i);
    expect(mockSelectAndPersist).not.toHaveBeenCalled();
    expect(mockResolveCredential).not.toHaveBeenCalled();
  });

  it('--team flag runs non-interactively even on a TTY', async () => {
    setTty(true);
    mockResolveTeamByKeyOrName.mockReturnValue(
      ok({ id: 'team-1', key: 'ENG' }) as unknown as ReturnType<typeof resolveTeamByKeyOrName>
    );

    await runTeamSelectFlow({ team: 'ENG' });

    expect(mockSelectAndPersist).not.toHaveBeenCalled();
    expect(mockMergeGlobalConfig).toHaveBeenCalledWith({
      team: { id: 'team-1', key: 'ENG' },
      projects: undefined,
    });
  });
});

describe('runTeamSelectNonInteractive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveCredential.mockReturnValue(
      ok({ type: 'apiKey', value: 'lin_api_key' }) as unknown as ReturnType<
        typeof resolveCredential
      >
    );
    mockUpdateEntry.mockResolvedValue({ isErr: () => false } as unknown as Awaited<
      ReturnType<typeof updateEntry>
    >);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws a usage error when --team is missing', async () => {
    await expect(runTeamSelectNonInteractive({})).rejects.toThrow(/--team is required/i);
    expect(mockResolveCredential).not.toHaveBeenCalled();
  });

  it('resolves --team and writes it to the registry entry when linked', async () => {
    mockFindProjectRoot.mockReturnValue('/repo');
    mockGetEntry.mockReturnValue({ root: '/repo', workspace: 'ws-1' } as RegisteredProject);
    mockResolveTeamByKeyOrName.mockReturnValue(
      ok({ id: 'team-1', key: 'ENG' }) as unknown as ReturnType<typeof resolveTeamByKeyOrName>
    );

    await runTeamSelectNonInteractive({ team: 'ENG' });

    expect(mockUpdateEntry).toHaveBeenCalledWith('/repo', { team: { id: 'team-1', key: 'ENG' } });
    expect(mockMergeGlobalConfig).toHaveBeenCalledWith({ projects: undefined });
  });

  it('--all-projects resolves every team project without prompting', async () => {
    mockFindProjectRoot.mockReturnValue(null);
    mockResolveTeamByKeyOrName.mockReturnValue(
      ok({ id: 'team-1', key: 'ENG' }) as unknown as ReturnType<typeof resolveTeamByKeyOrName>
    );
    mockResolveAllTeamProjects.mockReturnValue(
      ok([{ id: 'proj-1', name: 'Roadmap' }]) as unknown as ReturnType<
        typeof resolveAllTeamProjects
      >
    );

    await runTeamSelectNonInteractive({ team: 'ENG', allProjects: true });

    expect(mockMergeGlobalConfig).toHaveBeenCalledWith({
      team: { id: 'team-1', key: 'ENG' },
      projects: [{ id: 'proj-1', name: 'Roadmap' }],
    });
  });

  it('--projects resolves the named projects by team scope', async () => {
    mockFindProjectRoot.mockReturnValue(null);
    mockResolveTeamByKeyOrName.mockReturnValue(
      ok({ id: 'team-1', key: 'ENG' }) as unknown as ReturnType<typeof resolveTeamByKeyOrName>
    );
    mockResolveTeamProjectsByName.mockReturnValue(
      ok([{ id: 'proj-1', name: 'Roadmap' }]) as unknown as ReturnType<
        typeof resolveTeamProjectsByName
      >
    );

    await runTeamSelectNonInteractive({ team: 'ENG', projects: 'Roadmap' });

    expect(mockResolveTeamProjectsByName).toHaveBeenCalledWith(
      'team-1',
      ['Roadmap'],
      expect.anything()
    );
    expect(mockMergeGlobalConfig).toHaveBeenCalledWith({
      team: { id: 'team-1', key: 'ENG' },
      projects: [{ id: 'proj-1', name: 'Roadmap' }],
    });
  });

  it('propagates a NotFoundError when the team does not resolve', async () => {
    mockFindProjectRoot.mockReturnValue(null);
    const notFound = err(new Error("team 'bogus' not found")) as unknown as ReturnType<
      typeof resolveTeamByKeyOrName
    >;
    mockResolveTeamByKeyOrName.mockReturnValue(notFound);

    await expect(runTeamSelectNonInteractive({ team: 'bogus' })).rejects.toThrow(/not found/i);
    expect(mockMergeGlobalConfig).not.toHaveBeenCalled();
  });

  it('plain output prints team: and projects: lines', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockFindProjectRoot.mockReturnValue(null);
    mockResolveTeamByKeyOrName.mockReturnValue(
      ok({ id: 'team-1', key: 'ENG' }) as unknown as ReturnType<typeof resolveTeamByKeyOrName>
    );
    mockResolveAllTeamProjects.mockReturnValue(
      ok([{ id: 'proj-1', name: 'Roadmap' }]) as unknown as ReturnType<
        typeof resolveAllTeamProjects
      >
    );

    await runTeamSelectNonInteractive({ team: 'ENG', allProjects: true, plain: true });

    expect(log).toHaveBeenCalledWith('team: ENG');
    expect(log).toHaveBeenCalledWith('projects: Roadmap');
    log.mockRestore();
  });
});
