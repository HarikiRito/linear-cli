import type { LinearClient } from '@linear/sdk';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/client/index.js', () => ({ getRequestFn: vi.fn() }));

import { getRequestFn } from '../../../../lib/client/index.js';
import { getProjectTeamIds } from '../resolve.js';

const client = {} as LinearClient;

describe('getProjectTeamIds', () => {
  it('returns the de-duplicated union of the projects teams', async () => {
    const teams: Record<string, string[]> = { p1: ['t1', 't2'], p2: ['t2', 't3'] };
    vi.mocked(getRequestFn).mockReturnValue(
      vi.fn(async (_doc, vars: { id: string }) => ({
        project: { teams: { nodes: teams[vars.id].map((id) => ({ id })) } },
      })) as never
    );

    const result = await getProjectTeamIds(['p1', 'p2'], client);

    expect(result._unsafeUnwrap()).toEqual(['t1', 't2', 't3']);
  });

  it('errors with NotFoundError when a project does not exist', async () => {
    vi.mocked(getRequestFn).mockReturnValue(vi.fn(async () => ({ project: null })) as never);

    const result = await getProjectTeamIds(['p1'], client);

    expect(result._unsafeUnwrapErr().message).toContain("project 'p1' not found");
  });
});
