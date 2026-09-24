import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTmpProjectAndHome } from '../../../../tests/helpers/tmp-env.js';

// Mock before importing the module under test.
vi.mock('@clack/prompts', () => ({
  select: vi.fn(),
  multiselect: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
}));

import { isCancel, multiselect, select } from '@clack/prompts';
import { getEntry, linkProject } from '../../keepalive/registry.js';
import {
  persistLinkedProjects,
  resolveAllTeamProjects,
  resolveTeamByKeyOrName,
  resolveTeamProjectsByName,
  selectDefaultProjects,
  selectDefaultTeam,
} from '../team-select.js';

const mockSelect = vi.mocked(select);
const mockMultiselect = vi.mocked(multiselect);
const mockIsCancel = vi.mocked(isCancel);

type MockTeam = { id: string; key: string; name: string };
type MockProject = { id: string; name: string };

/** Duck-typed LinearClient whose teams()/team().projects() resolve the given nodes. */
function mockClient(
  teams: MockTeam[],
  projects: MockProject[]
): Parameters<typeof selectDefaultTeam>[0] {
  return {
    teams: () => Promise.resolve({ nodes: teams }),
    team: () => ({ projects: () => Promise.resolve({ nodes: projects }) }),
  } as unknown as Parameters<typeof selectDefaultTeam>[0];
}

const ENGINEERING: MockTeam = { id: 'team-1', key: 'ENG', name: 'Engineering' };
const PLATFORM: MockTeam = { id: 'team-2', key: 'PROD', name: 'Platform' };
const WEBSITE: MockProject = { id: 'proj-1', name: 'Website' };
const MOBILE: MockProject = { id: 'proj-2', name: 'Mobile' };

describe('selectDefaultTeam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-picks the only team without prompting', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const client = mockClient([ENGINEERING], []);

    const result = await selectDefaultTeam(client);

    expect(result).toEqual({ id: 'team-1', key: 'ENG' });
    expect(mockSelect).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('only team'));
  });

  it('prompts via select when there are 2+ teams', async () => {
    mockSelect.mockResolvedValue('team-2');
    const client = mockClient([ENGINEERING, PLATFORM], []);

    const result = await selectDefaultTeam(client);

    expect(mockSelect).toHaveBeenCalledOnce();
    const prompt = mockSelect.mock.calls[0][0] as { options: unknown[] };
    expect(prompt).not.toHaveProperty('initialValue');
    expect(prompt.options).toEqual([
      { value: 'team-1', label: 'Engineering (ENG)' },
      { value: 'team-2', label: 'Platform (PROD)' },
    ]);
    expect(result).toEqual({ id: 'team-2', key: 'PROD' });
  });

  it('returns undefined with no teams and does not prompt', async () => {
    const client = mockClient([], []);

    expect(await selectDefaultTeam(client)).toBeUndefined();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns undefined when the teams fetch fails and does not prompt', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = { teams: () => Promise.reject(new Error('401')) } as unknown as Parameters<
      typeof selectDefaultTeam
    >[0];

    expect(await selectDefaultTeam(client)).toBeUndefined();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('could not fetch teams'));
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns undefined when the user cancels the prompt', async () => {
    mockIsCancel.mockReturnValue(true);
    mockSelect.mockResolvedValue('team-1');
    const client = mockClient([ENGINEERING, PLATFORM], []);

    expect(await selectDefaultTeam(client)).toBeUndefined();
  });
});

describe('selectDefaultProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-picks the only project without prompting', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const client = mockClient([ENGINEERING], [WEBSITE]);

    const result = await selectDefaultProjects(client, 'team-1');

    expect(result).toEqual([{ id: 'proj-1', name: 'Website' }]);
    expect(mockMultiselect).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('only project'));
  });

  it('prompts via multiselect when there are 2+ projects', async () => {
    mockMultiselect.mockResolvedValue(['proj-1', 'proj-2']);
    const client = mockClient([ENGINEERING], [WEBSITE, MOBILE]);

    const result = await selectDefaultProjects(client, 'team-1');

    expect(mockMultiselect).toHaveBeenCalledOnce();
    const prompt = mockMultiselect.mock.calls[0][0] as { options: unknown[] };
    expect(prompt.options).toEqual([
      { value: 'proj-1', label: 'Website' },
      { value: 'proj-2', label: 'Mobile' },
    ]);
    expect(result).toEqual([
      { id: 'proj-1', name: 'Website' },
      { id: 'proj-2', name: 'Mobile' },
    ]);
  });

  it('returns undefined with no projects and does not prompt', async () => {
    const client = mockClient([ENGINEERING], []);

    expect(await selectDefaultProjects(client, 'team-1')).toBeUndefined();
    expect(mockMultiselect).not.toHaveBeenCalled();
  });

  it('returns undefined when the projects fetch fails and does not prompt', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = {
      team: () => ({ projects: () => Promise.reject(new Error('401')) }),
    } as unknown as Parameters<typeof selectDefaultTeam>[0];

    expect(await selectDefaultProjects(client, 'team-1')).toBeUndefined();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('could not fetch projects'));
    expect(mockMultiselect).not.toHaveBeenCalled();
  });

  it('returns undefined when the user cancels the prompt', async () => {
    mockIsCancel.mockReturnValue(true);
    mockMultiselect.mockResolvedValue(undefined as never);
    const client = mockClient([ENGINEERING], [WEBSITE, MOBILE]);

    expect(await selectDefaultProjects(client, 'team-1')).toBeUndefined();
  });

  it('returns undefined when the user selects nothing', async () => {
    mockMultiselect.mockResolvedValue([]);
    const client = mockClient([ENGINEERING], [WEBSITE, MOBILE]);

    expect(await selectDefaultProjects(client, 'team-1')).toBeUndefined();
  });
});

describe('persistLinkedProjects', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-persist-linked-projects-',
    homePrefix: 'linear-persist-linked-projects-home-',
  });

  it('writes a non-empty selection onto the linked registry entry', async () => {
    await linkProject(tmpEnv.projectDir, 'ws-1');

    await persistLinkedProjects(tmpEnv.projectDir, [
      { id: 'proj-1', name: 'Website' },
      { id: 'proj-2', name: 'Mobile' },
    ]);

    expect(getEntry(tmpEnv.projectDir)?.projects).toEqual([
      { id: 'proj-1', name: 'Website' },
      { id: 'proj-2', name: 'Mobile' },
    ]);
  });

  it('an undefined selection clears a previously scoped one', async () => {
    await linkProject(tmpEnv.projectDir, 'ws-1');
    await persistLinkedProjects(tmpEnv.projectDir, [{ id: 'proj-1', name: 'Website' }]);
    expect(getEntry(tmpEnv.projectDir)?.projects).toEqual([{ id: 'proj-1', name: 'Website' }]);

    await persistLinkedProjects(tmpEnv.projectDir, undefined);

    expect(getEntry(tmpEnv.projectDir)?.projects).toEqual([]);
  });

  it('is a no-op when the directory is not a linked registry entry', async () => {
    await persistLinkedProjects(tmpEnv.projectDir, [{ id: 'proj-1', name: 'X' }]);
    expect(getEntry(tmpEnv.projectDir)).toBeUndefined();
  });
});

describe('resolveTeamByKeyOrName (H-645: non-interactive --team)', () => {
  it('matches by key case-insensitively', async () => {
    const client = mockClient([ENGINEERING, PLATFORM], []);

    const result = await resolveTeamByKeyOrName('eng', client);

    expect(result._unsafeUnwrap()).toEqual({ id: 'team-1', key: 'ENG' });
  });

  it('matches by name case-insensitively', async () => {
    const client = mockClient([ENGINEERING, PLATFORM], []);

    const result = await resolveTeamByKeyOrName('platform', client);

    expect(result._unsafeUnwrap()).toEqual({ id: 'team-2', key: 'PROD' });
  });

  it('returns NotFoundError listing valid choices when nothing matches', async () => {
    const client = mockClient([ENGINEERING, PLATFORM], []);

    const result = await resolveTeamByKeyOrName('bogus', client);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('Engineering (ENG)');
    expect(result._unsafeUnwrapErr().message).toContain('Platform (PROD)');
  });
});

describe('resolveTeamProjectsByName (H-645: non-interactive --projects)', () => {
  it('resolves each requested name scoped to the team', async () => {
    const client = mockClient([ENGINEERING], [WEBSITE, MOBILE]);

    const result = await resolveTeamProjectsByName('team-1', ['Website', 'mobile'], client);

    expect(result._unsafeUnwrap()).toEqual([
      { id: 'proj-1', name: 'Website' },
      { id: 'proj-2', name: 'Mobile' },
    ]);
  });

  it('returns NotFoundError listing valid project names for an unmatched name', async () => {
    const client = mockClient([ENGINEERING], [WEBSITE, MOBILE]);

    const result = await resolveTeamProjectsByName('team-1', ['Nope'], client);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('Website, Mobile');
  });

  it('returns an empty array without fetching when no names are requested', async () => {
    const client = mockClient([ENGINEERING], [WEBSITE, MOBILE]);

    const result = await resolveTeamProjectsByName('team-1', [], client);

    expect(result._unsafeUnwrap()).toEqual([]);
  });
});

describe('resolveAllTeamProjects (H-645: non-interactive --all-projects)', () => {
  it('returns every project on the team', async () => {
    const client = mockClient([ENGINEERING], [WEBSITE, MOBILE]);

    const result = await resolveAllTeamProjects('team-1', client);

    expect(result._unsafeUnwrap()).toEqual([
      { id: 'proj-1', name: 'Website' },
      { id: 'proj-2', name: 'Mobile' },
    ]);
  });

  it('returns an empty array when the team has no projects', async () => {
    const client = mockClient([ENGINEERING], []);

    const result = await resolveAllTeamProjects('team-1', client);

    expect(result._unsafeUnwrap()).toEqual([]);
  });
});
