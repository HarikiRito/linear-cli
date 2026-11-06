import { errAsync, ok, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/client/index.js', () => ({
  getClientWithAuthRetry: vi.fn(),
  getRequestFn: vi.fn(),
}));
vi.mock('../../../../lib/runner.js', () => ({ exitError: vi.fn() }));
vi.mock('../../../issues/shared/resolve.js', () => ({
  resolveTeam: vi.fn(),
  getDefaultProjectTeamIds: vi.fn(),
  resolveSearchTeamId: vi.fn(),
}));

import type { LinearClient } from '@linear/sdk';
import { Command } from 'commander';
import { getClientWithAuthRetry, getRequestFn } from '../../../../lib/client/index.js';
import { NotFoundError } from '../../../../lib/errors.js';
import { exitError } from '../../../../lib/runner.js';
import { resolveSearchTeamId } from '../../../issues/shared/resolve.js';
import { registerQueryCommand } from '../command.js';
import { type QueryOptions, queryDocuments } from '../query.js';

const emptyResponse = {
  searchDocuments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
};

const baseOpts: QueryOptions = {
  term: 'roadmap',
  limit: 10,
  plain: true,
  includeComments: true,
  includeArchived: false,
};

describe('queryDocuments', () => {
  let requestFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    requestFn = vi.fn().mockResolvedValue(emptyResponse);
    vi.mocked(getRequestFn).mockReturnValue(requestFn);
    vi.mocked(getClientWithAuthRetry).mockResolvedValue(ok({} as unknown as LinearClient));
    vi.mocked(resolveSearchTeamId).mockReturnValue(okAsync(undefined));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sentVariables = () => requestFn.mock.calls[0][1] as Record<string, unknown>;

  it('sends one request with term, comments on, no team, no archived flag by default', async () => {
    await queryDocuments(baseOpts);

    expect(requestFn).toHaveBeenCalledTimes(1);
    expect(sentVariables()).toEqual({
      term: 'roadmap',
      teamId: undefined,
      includeComments: true,
      first: 10,
      after: undefined,
    });
  });

  it('sends includeComments=false, includeArchived=true and the --after cursor', async () => {
    await queryDocuments({ ...baseOpts, includeComments: false, includeArchived: true, after: 'cur' });

    expect(sentVariables()).toMatchObject({
      includeComments: false,
      includeArchived: true,
      after: 'cur',
    });
  });

  it('sends the team id from resolveSearchTeamId', async () => {
    vi.mocked(resolveSearchTeamId).mockReturnValue(okAsync('team-1'));

    await queryDocuments({ ...baseOpts, team: 'ENG' });

    expect(resolveSearchTeamId).toHaveBeenCalledWith('ENG', expect.anything());
    expect(sentVariables().teamId).toBe('team-1');
  });

  it('fails without searching when the team lookup fails', async () => {
    const error = new NotFoundError('project', 'p1');
    vi.mocked(resolveSearchTeamId).mockReturnValue(errAsync(error));

    await queryDocuments(baseOpts);

    expect(exitError).toHaveBeenCalledWith(error);
    expect(requestFn).not.toHaveBeenCalled();
  });

  it('renders results as returned, without client-side filtering', async () => {
    requestFn.mockResolvedValue({ searchDocuments: { nodes: [{ id: 'd1', title: 'Roadmap Doc', slugId: 'roadmap-doc-abc', updatedAt: '2026-01-01T00:00:00.000Z', project: { id: 'p1', name: 'Proj' } }], pageInfo: { hasNextPage: true, endCursor: 'next' } } });

    await queryDocuments(baseOpts);

    const out = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('Roadmap Doc');
    expect(out).toContain('nextCursor: next');
  });
});

describe('documents query command options', () => {
  async function run(args: string[]): Promise<Record<string, unknown>> {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const requestFn = vi.fn().mockResolvedValue(emptyResponse);
    vi.mocked(getClientWithAuthRetry).mockResolvedValue(ok({} as unknown as LinearClient));
    vi.mocked(getRequestFn).mockReturnValue(requestFn);
    vi.mocked(resolveSearchTeamId).mockReturnValue(okAsync(undefined));
    const parent = new Command('documents').exitOverride();
    parent.configureOutput({ writeErr: () => {} });
    registerQueryCommand(parent);
    const program = new Command().exitOverride();
    program.configureOutput({ writeErr: () => {} });
    program.addCommand(parent);
    await program.parseAsync(['node', 'linear', 'documents', 'query', 'bug', ...args]);
    return requestFn.mock.calls[0][1] as Record<string, unknown>;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults limit to 10, clamps to 250, and sends comments on', async () => {
    expect(await run([])).toMatchObject({ first: 10, includeComments: true });
    expect(await run(['--limit', '500'])).toMatchObject({ first: 250 });
  });

  it('--no-comments turns comment search off', async () => {
    expect(await run(['--no-comments'])).toMatchObject({ includeComments: false });
  });

  it('--include-archived sets includeArchived', async () => {
    expect(await run(['--include-archived'])).toMatchObject({ includeArchived: true });
  });

  it('has no --project option', async () => {
    await expect(run(['--project', 'x'])).rejects.toThrow(/unknown option '--project'/);
  });
});
