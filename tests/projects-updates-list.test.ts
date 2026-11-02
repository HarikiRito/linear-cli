import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

const node = (
  i: number,
  body = `Update ${i}\n\nmore detail`,
  user: { name: string } | null = { name: 'Alice' }
) => ({
  id: `u${i}`,
  createdAt: `2024-01-${String(i).padStart(2, '0')}T00:00:00Z`,
  health: 'onTrack',
  body,
  user,
});

function setup(opts: { projects?: unknown[]; nodes?: unknown[]; hasNextPage?: boolean } = {}) {
  const requestFn = vi.fn().mockResolvedValue({
    project: {
      projectUpdates: {
        nodes: opts.nodes ?? [],
        pageInfo: { hasNextPage: opts.hasNextPage ?? false, endCursor: 'cur-1' },
      },
    },
  });
  const client = {
    projects: vi
      .fn()
      .mockResolvedValue({ nodes: opts.projects ?? [{ id: 'proj-uuid', name: 'App' }] }),
  };
  const exitErrorFn = vi.fn();
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok(client)),
    getClientWithAuthRetry: vi.fn().mockReturnValue(ok(client)),
    getRequestFn: vi.fn().mockReturnValue(requestFn),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn((_h: string[], rows: string[][]) =>
      rows.map((r) => r.join(' | ')).join('\n')
    ),
    printTable: vi.fn((s: string) => console.log(s)),
  }));
  vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorFn }));
  return { requestFn, exitErrorFn };
}

async function run(...args: string[]) {
  const { registerProjects } = await import('../src/features/projects/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.option('--plain').exitOverride();
  registerProjects(program);
  await program.parseAsync(['node', 'linear', 'projects', 'updates', 'list', ...args]);
}

describe('projects updates list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    process.exitCode = undefined;
  });

  it('defaults to first=10 newest first and prints rows with first body line', async () => {
    const nodes = Array.from({ length: 12 }, (_, i) => node(i + 1));
    nodes[1] = node(2, 'x', null);
    const { requestFn } = setup({ nodes });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await run('--project', 'App');
    expect(requestFn).toHaveBeenCalledTimes(1);
    expect(requestFn.mock.calls[0][1]).toEqual({
      projectId: 'proj-uuid',
      first: 10,
      after: undefined,
    });
    expect(JSON.stringify(requestFn.mock.calls[0][0])).toContain('orderBy');
    const out = log.mock.calls.flat().join('\n');
    expect(out).toContain('u1 | 2024-01-01T00:00:00Z | onTrack | Alice | Update 1');
    expect(out).not.toContain('more detail');
    expect(out).toContain('u2 | 2024-01-02T00:00:00Z | onTrack |  | x');
  });

  it('--limit and --after are forwarded; next page cursor printed', async () => {
    const { requestFn } = setup({ nodes: [node(1)], hasNextPage: true });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await run('--project', 'App', '--limit', '3', '--after', 'c0');
    expect(requestFn.mock.calls[0][1]).toMatchObject({ first: 3, after: 'c0' });
    expect(log.mock.calls.flat().join('\n')).toContain('Next page: --after cur-1');
  });

  it('--limit truncates non-integers', async () => {
    const { requestFn } = setup({ nodes: [node(1)] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await run('--project', 'App', '--limit', '2.5');
    expect(requestFn.mock.calls[0][1]).toMatchObject({ first: 2 });
  });

  it('empty prints message and no error', async () => {
    const { exitErrorFn } = setup();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await run('--project', 'App');
    expect(log).toHaveBeenCalledWith('No project updates found.');
    expect(exitErrorFn).not.toHaveBeenCalled();
  });

  it('--plain output', async () => {
    setup({ nodes: [node(1)] });
    vi.stubEnv('LINEAR_OUTPUT', 'plain');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await run('--project', 'App');
    const out = log.mock.calls.flat().join('\n');
    expect(out).toContain('ProjectUpdate: u1');
    expect(out).toContain('health: onTrack');
    expect(out).toContain('author: Alice');
  });

  it('missing --project is a commander error', async () => {
    const { requestFn } = setup();
    await expect(run()).rejects.toThrow();
    expect(requestFn).not.toHaveBeenCalled();
  });

  it('unresolvable project errors without querying updates', async () => {
    const { requestFn, exitErrorFn } = setup({ projects: [] });
    await run('--project', 'Nope');
    expect(requestFn).not.toHaveBeenCalled();
    expect(exitErrorFn).toHaveBeenCalledTimes(1);
  });
});
