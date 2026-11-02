import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

const BODY = 'Version X\n\n* [E-1 T](<u>)\n  [a.apk](https://assets/a.apk)';
const update = {
  id: 'upd-uuid',
  createdAt: '2024-02-01T00:00:00Z',
  health: 'atRisk',
  body: BODY,
  url: 'https://linear.app/proj/updates/upd-uuid',
  user: { name: 'Alice' },
};

function setup(requestFn: ReturnType<typeof vi.fn>) {
  const client = {};
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
  return { exitErrorFn };
}

async function run(...args: string[]) {
  const { registerProjects } = await import('../src/features/projects/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.option('--plain').exitOverride();
  registerProjects(program);
  await program.parseAsync(['node', 'linear', 'projects', 'updates', 'get', ...args]);
}

describe('projects updates get', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    process.exitCode = undefined;
  });

  it('prints fields and full unmodified body', async () => {
    const requestFn = vi.fn().mockResolvedValue({ projectUpdate: update });
    setup(requestFn);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await run('upd-uuid');
    expect(requestFn.mock.calls[0][1]).toEqual({ id: 'upd-uuid' });
    const out = log.mock.calls.flat().join('\n');
    expect(out).toContain(BODY);
    for (const s of ['atRisk', 'Alice', '2024-02-01T00:00:00Z', update.url]) {
      expect(out).toContain(s);
    }
  });

  it('--plain output includes body', async () => {
    setup(vi.fn().mockResolvedValue({ projectUpdate: update }));
    vi.stubEnv('LINEAR_OUTPUT', 'plain');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await run('upd-uuid');
    const out = log.mock.calls.flat().join('\n');
    expect(out).toContain('ProjectUpdate: upd-uuid');
    expect(out).toContain('health: atRisk');
    expect(out).toContain('  [a.apk](https://assets/a.apk)');
  });

  it.each([
    ['null node', () => vi.fn().mockResolvedValue({ projectUpdate: null })],
    [
      'not-found error',
      () => vi.fn().mockRejectedValue(new Error('Entity not found: ProjectUpdate')),
    ],
  ])('%s -> NotFoundError', async (_n, makeRequestFn) => {
    const { exitErrorFn } = setup(makeRequestFn());
    await run('nope');
    expect(exitErrorFn).toHaveBeenCalledTimes(1);
    expect(exitErrorFn.mock.calls[0][0]).toMatchObject({
      kind: 'NotFoundError',
      message: "project update 'nope' not found",
    });
  });

  it('unrelated not-found error is not mapped to project update', async () => {
    const { exitErrorFn } = setup(vi.fn().mockRejectedValue(new Error('Team not found')));
    await run('x');
    expect(exitErrorFn.mock.calls[0][0].message).not.toContain('project update');
  });
});
