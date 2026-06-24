import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeProjectMock(name = 'Test Project') {
  return {
    id: 'proj-uuid',
    name,
    state: 'planned',
    url: 'https://linear.app/proj/proj-uuid',
    get lead() {
      return Promise.resolve(null);
    },
  };
}

function makeProjectPayloadMock(projectMock = makeProjectMock()) {
  return {
    get project() {
      return Promise.resolve(projectMock);
    },
  };
}

function makeClientMock(overrides: Record<string, unknown>) {
  return overrides;
}

function stdMocks(clientMock: ReturnType<typeof makeClientMock>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok(clientMock)),
    getRequestFn: vi.fn(),
  }));
  vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
  vi.doMock('../src/lib/output/markdown.js', () => ({
    markdownTable: vi.fn().mockReturnValue(''),
    printMarkdown: vi.fn(),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn().mockReturnValue(''),
    printTable: vi.fn(),
  }));
  vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
}

async function buildProgram() {
  const { registerProjects } = await import('../src/features/projects/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerProjects(program);
  return program;
}

describe('projects create', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls createProject with name and teamIds', async () => {
    const createProjectFn = vi.fn().mockResolvedValue(makeProjectPayloadMock());
    const teamsFn = vi
      .fn()
      .mockResolvedValue({ nodes: [{ id: 'team-uuid', name: 'Engineering' }] });
    const clientMock = makeClientMock({ createProject: createProjectFn, teams: teamsFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'projects',
      'create',
      '--name',
      'My Project',
      '--team',
      'Engineering',
      '--json',
    ]);

    expect(createProjectFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My Project', teamIds: ['team-uuid'] })
    );
  });

  it('missing --name causes Commander error', async () => {
    const clientMock = makeClientMock({});
    stdMocks(clientMock);
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'projects', 'create', '--team', 'ENG'])
    ).rejects.toThrow();
  });

  it('missing --team causes Commander error', async () => {
    const clientMock = makeClientMock({});
    stdMocks(clientMock);
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'projects', 'create', '--name', 'Foo'])
    ).rejects.toThrow();
  });

  it('--description is passed to mutation', async () => {
    const createProjectFn = vi.fn().mockResolvedValue(makeProjectPayloadMock());
    const teamsFn = vi
      .fn()
      .mockResolvedValue({ nodes: [{ id: 'team-uuid', name: 'Engineering' }] });
    const clientMock = makeClientMock({ createProject: createProjectFn, teams: teamsFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'projects',
      'create',
      '--name',
      'Proj',
      '--team',
      'Engineering',
      '--description',
      'A nice project',
      '--json',
    ]);

    expect(createProjectFn).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'A nice project' })
    );
  });
});

describe('projects update', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('calls updateProject with only provided fields', async () => {
    const updateProjectFn = vi
      .fn()
      .mockResolvedValue(makeProjectPayloadMock(makeProjectMock('Bar')));
    const projectsFn = vi
      .fn()
      .mockResolvedValue({ nodes: [{ id: 'proj-uuid', name: 'Old Name' }] });
    const clientMock = makeClientMock({ updateProject: updateProjectFn, projects: projectsFn });
    stdMocks(clientMock);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'projects',
      'update',
      'Old Name',
      '--name',
      'Bar',
      '--json',
    ]);

    // Should be called with only { name: 'Bar' } — no other spurious fields
    const callArg = updateProjectFn.mock.calls[0][1];
    expect(callArg).toEqual({ name: 'Bar' });
  });
});
