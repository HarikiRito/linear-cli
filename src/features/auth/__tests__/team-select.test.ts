import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock before importing the module under test.
vi.mock('@clack/prompts', () => ({
  select: vi.fn(),
  multiselect: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
}));

import { isCancel, multiselect, select } from '@clack/prompts';
import { selectDefaultProjects, selectDefaultTeam } from '../team-select.js';

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
