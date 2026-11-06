import { errAsync, ok, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/client/index.js', () => ({
  getClientWithAuthRetry: vi.fn(),
  getRequestFn: vi.fn(),
}));
vi.mock('../../../../lib/runner.js', () => ({ exitError: vi.fn() }));
vi.mock('../../shared/resolve.js', () => ({
  resolveProject: vi.fn(),
  resolveTeam: vi.fn(),
  getDefaultProjectTeamIds: vi.fn(),
}));

import type { LinearClient } from '@linear/sdk';
import { Command } from 'commander';
import { getClientWithAuthRetry, getRequestFn } from '../../../../lib/client/index.js';
import { NotFoundError } from '../../../../lib/errors.js';
import { exitError } from '../../../../lib/runner.js';
import { getDefaultProjectTeamIds, resolveProject, resolveTeam } from '../../shared/resolve.js';
import { registerQueryCommand } from '../command.js';
import { type QueryOptions, queryIssues } from '../query.js';

const emptyResponse = {
  searchIssues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
};

const baseOpts: QueryOptions = {
  term: 'H-1528',
  limit: 10,
  plain: true,
  states: [],
  includeComments: true,
  includeArchived: false,
};

describe('queryIssues', () => {
  let requestFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    requestFn = vi.fn().mockResolvedValue(emptyResponse);
    vi.mocked(getRequestFn).mockReturnValue(requestFn);
    vi.mocked(getClientWithAuthRetry).mockResolvedValue(ok({} as unknown as LinearClient));
    vi.mocked(getDefaultProjectTeamIds).mockReturnValue(okAsync([]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sentVariables = () => requestFn.mock.calls[0][1] as Record<string, unknown>;

  it('sends term, comments on, no archived flag, no state filter by default', async () => {
    await queryIssues(baseOpts);

    expect(requestFn).toHaveBeenCalledTimes(1);
    expect(sentVariables()).toEqual({
      term: 'H-1528',
      filter: undefined,
      includeComments: true,
      first: 10,
      after: undefined,
    });
  });

  it('sends includeComments=false and includeArchived=true when requested', async () => {
    await queryIssues({ ...baseOpts, includeComments: false, includeArchived: true });

    expect(sentVariables()).toMatchObject({ includeComments: false, includeArchived: true });
  });

  it('passes --after through and applies validated --state tokens', async () => {
    await queryIssues({ ...baseOpts, after: 'cur', states: ['todo'] });

    expect(sentVariables()).toMatchObject({
      after: 'cur',
      filter: { state: { name: { eqIgnoreCase: 'todo' } } },
    });
  });

  it('rejects unknown --state tokens before any client work', async () => {
    await queryIssues({ ...baseOpts, states: ['nope'] });

    expect(exitError).toHaveBeenCalledOnce();
    expect(getClientWithAuthRetry).not.toHaveBeenCalled();
  });

  it('scopes to the default project teams when no --project/--team', async () => {
    vi.mocked(getDefaultProjectTeamIds).mockReturnValue(okAsync(['t1', 't2']));

    await queryIssues(baseOpts);

    expect(sentVariables().filter).toEqual({ team: { id: { in: ['t1', 't2'] } } });
  });

  it('fails without searching when the default project teams lookup fails', async () => {
    const error = new NotFoundError('project', 'p1');
    vi.mocked(getDefaultProjectTeamIds).mockReturnValue(errAsync(error));

    await queryIssues(baseOpts);

    expect(exitError).toHaveBeenCalledWith(error);
    expect(requestFn).not.toHaveBeenCalled();
  });

  it('--team filters by the resolved team and skips default scoping', async () => {
    vi.mocked(resolveTeam).mockReturnValue(okAsync('team-1'));

    await queryIssues({ ...baseOpts, team: 'ENG' });

    expect(resolveTeam).toHaveBeenCalledWith('ENG', expect.anything());
    expect(getDefaultProjectTeamIds).not.toHaveBeenCalled();
    expect(sentVariables().filter).toEqual({ team: { id: { in: ['team-1'] } } });
  });

  it('--project filters by project and skips default scoping', async () => {
    vi.mocked(resolveProject).mockReturnValue(okAsync('proj-1'));

    await queryIssues({ ...baseOpts, project: 'X' });

    expect(getDefaultProjectTeamIds).not.toHaveBeenCalled();
    expect(sentVariables().filter).toEqual({ project: { id: { in: ['proj-1'] } } });
  });

  it('--project and --team are ANDed', async () => {
    vi.mocked(resolveProject).mockReturnValue(okAsync('proj-1'));
    vi.mocked(resolveTeam).mockReturnValue(okAsync('team-1'));

    await queryIssues({ ...baseOpts, project: 'X', team: 'ENG' });

    expect(sentVariables().filter).toEqual({
      and: [{ project: { id: { in: ['proj-1'] } } }, { team: { id: { in: ['team-1'] } } }],
    });
  });
});

describe('query command options', () => {
  async function run(args: string[]): Promise<void> {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(getClientWithAuthRetry).mockResolvedValue(ok({} as unknown as LinearClient));
    vi.mocked(getRequestFn).mockReturnValue(vi.fn().mockResolvedValue(emptyResponse));
    vi.mocked(getDefaultProjectTeamIds).mockReturnValue(okAsync([]));
    const issues = new Command('issues').exitOverride();
    issues.configureOutput({ writeErr: () => {} });
    registerQueryCommand(issues);
    const program = new Command().exitOverride();
    program.configureOutput({ writeErr: () => {} });
    program.addCommand(issues);
    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', ...args]);
  }

  const limitSent = async (args: string[]) => {
    await run(args);
    const requestFn = vi.mocked(getRequestFn).mock.results[0].value as ReturnType<typeof vi.fn>;
    return requestFn.mock.calls[0][1] as Record<string, unknown>;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults limit to 10, clamps to 250, and sends comments on', async () => {
    expect(await limitSent([])).toMatchObject({ first: 10, includeComments: true });
    expect(await limitSent(['--limit', '500'])).toMatchObject({ first: 250 });
  });

  it('--no-comments turns comment search off', async () => {
    expect(await limitSent(['--no-comments'])).toMatchObject({ includeComments: false });
  });

  it('--all is an unknown option', async () => {
    await expect(run(['--all'])).rejects.toThrow(/unknown option '--all'/);
  });
});
