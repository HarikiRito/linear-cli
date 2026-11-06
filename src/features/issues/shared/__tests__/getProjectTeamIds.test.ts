import fs from 'node:fs';
import path from 'node:path';
import type { LinearClient } from '@linear/sdk';
import { describe, expect, it, vi } from 'vitest';
import { useTmpProjectAndHome } from '../../../../../tests/helpers/tmp-env.js';

vi.mock('../../../../lib/client/index.js', () => ({ getRequestFn: vi.fn() }));

import { getRequestFn } from '../../../../lib/client/index.js';
import { getDefaultProjectTeamIds, getProjectTeamIds, resolveSearchTeamId } from '../resolve.js';

const client = {} as LinearClient;

describe('getProjectTeamIds', () => {
  it('returns the de-duplicated union of the projects teams', async () => {
    const teams: Record<string, string[]> = { p1: ['t1', 't2'], p2: ['t2', 't3'] };
    vi.mocked(getRequestFn).mockReturnValue(
      vi.fn((_doc, vars: { id: string }) =>
        Promise.resolve({
          project: { teams: { nodes: teams[vars.id].map((id) => ({ id })) } },
        })
      ) as never
    );

    const result = await getProjectTeamIds(['p1', 'p2'], client);

    expect(result._unsafeUnwrap()).toEqual(['t1', 't2', 't3']);
  });

  it('errors with NotFoundError when a project does not exist', async () => {
    vi.mocked(getRequestFn).mockReturnValue(vi.fn().mockResolvedValue({ project: null }) as never);

    const result = await getProjectTeamIds(['p1'], client);

    expect(result._unsafeUnwrapErr().message).toContain("project 'p1' not found");
  });
});

describe('default project team lookups', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-team-ids-project-',
    homePrefix: 'linear-team-ids-home-',
    deleteEnvVars: ['LINEAR_TEAM_ID', 'LINEAR_WORKSPACE'],
  });

  function configureDefaultProject(id: string): void {
    const dir = path.join(tmpEnv.homeDir, '.config', '.linear');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'config.toml'),
      `[[projects]]\nid = "${id}"\nname = "${id}-name"\n`,
      'utf-8'
    );
  }

  function mockProjectTeams(teamIds: string[]) {
    const requestFn = vi.fn().mockResolvedValue({
      project: { teams: { nodes: teamIds.map((id) => ({ id })) } },
    });
    vi.mocked(getRequestFn).mockReturnValue(requestFn as never);
    return requestFn;
  }

  it('getDefaultProjectTeamIds returns [] without a default project and does not query', async () => {
    const requestFn = mockProjectTeams(['t1']);

    const result = await getDefaultProjectTeamIds(client);

    expect(result._unsafeUnwrap()).toEqual([]);
    expect(requestFn).not.toHaveBeenCalled();
  });

  it('getDefaultProjectTeamIds returns the default projects teams', async () => {
    configureDefaultProject('p1');
    const requestFn = mockProjectTeams(['t1', 't2']);

    const result = await getDefaultProjectTeamIds(client);

    expect(result._unsafeUnwrap()).toEqual(['t1', 't2']);
    expect(requestFn).toHaveBeenCalledWith(expect.anything(), { id: 'p1' });
  });

  it('resolveSearchTeamId resolves an explicit team without touching the default project', async () => {
    configureDefaultProject('p1');
    const requestFn = mockProjectTeams(['t1']);
    const teamId = '11111111-1111-1111-1111-111111111111';

    const result = await resolveSearchTeamId(teamId, client);

    expect(result._unsafeUnwrap()).toBe(teamId);
    expect(requestFn).not.toHaveBeenCalled();
  });

  it('resolveSearchTeamId falls back to the default projects first team', async () => {
    configureDefaultProject('p1');
    mockProjectTeams(['t1', 't2']);

    const result = await resolveSearchTeamId(undefined, client);

    expect(result._unsafeUnwrap()).toBe('t1');
  });

  it('resolveSearchTeamId is undefined without a default project', async () => {
    mockProjectTeams(['t1']);

    const result = await resolveSearchTeamId(undefined, client);

    expect(result._unsafeUnwrap()).toBeUndefined();
  });

  it('resolveSearchTeamId errors when the default project lookup fails', async () => {
    configureDefaultProject('p1');
    vi.mocked(getRequestFn).mockReturnValue(vi.fn().mockResolvedValue({ project: null }) as never);

    const result = await resolveSearchTeamId(undefined, client);

    expect(result._unsafeUnwrapErr().message).toContain("project 'p1' not found");
  });
});
