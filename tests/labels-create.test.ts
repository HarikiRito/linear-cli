import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeLabelMock(name = 'bug', color = '#ff0000') {
  return {
    id: 'label-uuid',
    name,
    color,
    get team() {
      return Promise.resolve({ id: 'team-uuid', name: 'Engineering' });
    },
  };
}

function makeLabelPayloadMock(labelMock = makeLabelMock()) {
  return {
    get issueLabel() {
      return Promise.resolve(labelMock);
    },
  };
}

function makeClientMock(overrides: Record<string, unknown>) {
  return overrides;
}

function stdMocks(clientMock: ReturnType<typeof makeClientMock>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok(clientMock)),
    getClientWithAuthRetry: vi.fn().mockReturnValue(ok(clientMock)),
    getRequestFn: vi.fn(),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn().mockReturnValue(''),
    printTable: vi.fn(),
  }));
  vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
}

async function buildProgram() {
  const { registerLabels } = await import('../src/features/labels/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerLabels(program);
  return program;
}

describe('labels create', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls createIssueLabel with name and teamId when --team provided', async () => {
    const createIssueLabelFn = vi.fn().mockResolvedValue(makeLabelPayloadMock());
    const teamsFn = vi
      .fn()
      .mockResolvedValue({ nodes: [{ id: 'team-uuid', name: 'Engineering' }] });
    const clientMock = makeClientMock({ createIssueLabel: createIssueLabelFn, teams: teamsFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'labels',
      'create',
      '--name',
      'bug',
      '--team',
      'Engineering',
    ]);

    expect(createIssueLabelFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'bug', teamId: 'team-uuid' })
    );
  });

  it('--color is passed to mutation', async () => {
    const createIssueLabelFn = vi
      .fn()
      .mockResolvedValue(makeLabelPayloadMock(makeLabelMock('bug', '#ff0000')));
    const teamsFn = vi
      .fn()
      .mockResolvedValue({ nodes: [{ id: 'team-uuid', name: 'Engineering' }] });
    const clientMock = makeClientMock({ createIssueLabel: createIssueLabelFn, teams: teamsFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'labels',
      'create',
      '--name',
      'bug',
      '--team',
      'Engineering',
      '--color',
      '#ff0000',
    ]);

    expect(createIssueLabelFn).toHaveBeenCalledWith(expect.objectContaining({ color: '#ff0000' }));
  });

  it('missing --name causes Commander error', async () => {
    const clientMock = makeClientMock({});
    stdMocks(clientMock);
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'labels', 'create', '--team', 'ENG'])
    ).rejects.toThrow();
  });

  it('creates workspace-level label when --team is omitted', async () => {
    const labelWithoutTeam = {
      id: 'label-uuid',
      name: 'global',
      color: '#000000',
      get team() {
        return Promise.resolve(null);
      },
    };
    const createIssueLabelFn = vi.fn().mockResolvedValue({
      get issueLabel() {
        return Promise.resolve(labelWithoutTeam);
      },
    });
    const clientMock = makeClientMock({ createIssueLabel: createIssueLabelFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'labels', 'create', '--name', 'global']);

    expect(createIssueLabelFn).toHaveBeenCalledWith(expect.objectContaining({ name: 'global' }));
    const callArg = createIssueLabelFn.mock.calls[0][0];
    expect(callArg.teamId).toBeUndefined();
  });
});
